#!/usr/bin/env bash
# Capture the overlay (or embedded site) and push to YouTube RTMP.
# Designed for GitHub Actions runners with a ~1 hour segment budget.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG="${STREAM_CONFIG:-$ROOT/config/stream-config.json}"
OVERLAY_DIR="$ROOT/overlay"
SEGMENT_MINUTES="${SEGMENT_MINUTES:-55}"
HANDOFF_SECONDS="${HANDOFF_SECONDS:-90}"
DISPLAY_NUM="${DISPLAY_NUM:-99}"
export DISPLAY=":${DISPLAY_NUM}"

WIDTH="$(python3 -c "import json;print(json.load(open('$CONFIG'))['video']['width'])")"
HEIGHT="$(python3 -c "import json;print(json.load(open('$CONFIG'))['video']['height'])")"
FPS="$(python3 -c "import json;print(json.load(open('$CONFIG'))['video']['fps'])")"
BITRATE="$(python3 -c "import json;print(json.load(open('$CONFIG'))['video']['bitrate'])")"

YOUTUBE_RTMP_URL="${YOUTUBE_RTMP_URL:-rtmp://a.rtmp.youtube.com/live2}"
if [[ -z "${YOUTUBE_STREAM_KEY:-}" ]]; then
  echo "ERROR: YOUTUBE_STREAM_KEY secret is required" >&2
  exit 1
fi

STOP_FLAG="/tmp/stream-stop.flag"
SEGMENT_END_FLAG="/tmp/stream-segment-end.flag"
PID_FILE="/tmp/stream-ffmpeg.pid"
rm -f "$STOP_FLAG" "$SEGMENT_END_FLAG" "$PID_FILE"

echo "==> Stream segment starting (${SEGMENT_MINUTES}m budget, ${WIDTH}x${HEIGHT}@${FPS})"
echo "==> Overlay: $OVERLAY_DIR"
echo "==> Config: $CONFIG"

# Serve overlay + config locally so Chromium can load file assets consistently
python3 -m http.server 8765 --directory "$ROOT" >/tmp/overlay-http.log 2>&1 &
HTTP_PID=$!

cleanup() {
  echo "==> Cleaning up stream processes"
  [[ -f "$PID_FILE" ]] && kill "$(cat "$PID_FILE")" 2>/dev/null || true
  kill "$HTTP_PID" 2>/dev/null || true
  kill "$CHROME_PID" 2>/dev/null || true
  kill "$XVFB_PID" 2>/dev/null || true
  pkill -f "chromium|chrome|ffmpeg|Xvfb" 2>/dev/null || true
}
trap cleanup EXIT

# Virtual display
Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" -ac +extension RANDR >/tmp/xvfb.log 2>&1 &
XVFB_PID=$!
sleep 1

# Open overlay in Chromium (kiosk)
CHROME_BIN="$(command -v google-chrome || command -v chromium-browser || command -v chromium || true)"
if [[ -z "$CHROME_BIN" ]]; then
  echo "ERROR: Chromium/Chrome not found" >&2
  exit 1
fi

"$CHROME_BIN" \
  --display="$DISPLAY" \
  --window-size="${WIDTH},${HEIGHT}" \
  --window-position=0,0 \
  --kiosk \
  --no-sandbox \
  --disable-gpu \
  --disable-dev-shm-usage \
  --noerrdialogs \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --no-first-run \
  --no-default-browser-check \
  --disable-translate \
  --autoplay-policy=no-user-gesture-required \
  --user-data-dir=/tmp/chrome-stream-profile \
  "http://127.0.0.1:8765/overlay/" \
  >/tmp/chrome.log 2>&1 &
CHROME_PID=$!
sleep 4

# Audio: silent tone so YouTube accepts the ingest (required by many live endpoints)
ffmpeg -hide_banner -loglevel error \
  -f lavfi -i "anullsrc=channel_layout=stereo:sample_rate=44100" \
  -f x11grab -video_size "${WIDTH}x${HEIGHT}" -framerate "$FPS" -i "$DISPLAY" \
  -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p \
  -b:v "$BITRATE" -maxrate "$BITRATE" -bufsize 5000k -g $((FPS * 2)) \
  -c:a aac -b:a 128k -ar 44100 \
  -f flv "${YOUTUBE_RTMP_URL}/${YOUTUBE_STREAM_KEY}" \
  >/tmp/ffmpeg.log 2>&1 &
FFMPEG_PID=$!
echo "$FFMPEG_PID" > "$PID_FILE"
echo "==> FFmpeg PID $FFMPEG_PID pushing to YouTube"

SEGMENT_SECONDS=$((SEGMENT_MINUTES * 60))
START_TS=$(date +%s)
HANDOFF_AT=$((START_TS + SEGMENT_SECONDS - HANDOFF_SECONDS))
HANDOFF_TRIGGERED=0

should_stop() {
  if [[ -f "$STOP_FLAG" ]]; then
    return 0
  fi
  if [[ "${CHECK_STOP_VIA_API:-1}" == "1" && -n "${GITHUB_TOKEN:-}" && -n "${GITHUB_REPOSITORY:-}" ]]; then
    # Repository variable STREAM_ACTIVE=false means operator requested end
    local val
    val=$(curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/variables/STREAM_ACTIVE" \
      | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('value',''))" 2>/dev/null || true)
    if [[ "$val" == "false" || "$val" == "0" ]]; then
      return 0
    fi
  fi
  return 1
}

trigger_continuation() {
  local next_workflow="${CONTINUE_WORKFLOW:-continue-livestream.yml}"
  local segment_num="${SEGMENT_NUMBER:-1}"
  local next_segment=$((segment_num + 1))
  local event_type="continue-stream"
  if [[ "$next_workflow" == *"livestream.yml" && "$next_workflow" != *"continue"* ]]; then
    event_type="start-stream"
  fi

  echo "==> Handing off to workflow: $next_workflow (segment $next_segment)"
  if [[ -n "${GITHUB_TOKEN:-}" && -n "${GITHUB_REPOSITORY:-}" ]]; then
    if gh workflow run "$next_workflow" \
      --repo "$GITHUB_REPOSITORY" \
      -f segment="$next_segment" \
      -f reason="hourly-handoff"; then
      echo "==> Triggered $next_workflow via workflow_dispatch"
    else
      echo "==> workflow_dispatch failed — falling back to repository_dispatch ($event_type)"
      curl -sS -X POST \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github+json" \
        "https://api.github.com/repos/${GITHUB_REPOSITORY}/dispatches" \
        -d "{\"event_type\":\"${event_type}\",\"client_payload\":{\"segment\":${next_segment},\"reason\":\"hourly-handoff\"}}"
    fi
  else
    echo "WARN: Cannot trigger continuation without GITHUB_TOKEN/GITHUB_REPOSITORY" >&2
  fi
}

while kill -0 "$FFMPEG_PID" 2>/dev/null; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TS))

  if should_stop; then
    echo "==> Stop requested — ending stream segment"
    touch "$STOP_FLAG"
    break
  fi

  if [[ $HANDOFF_TRIGGERED -eq 0 && $NOW -ge $HANDOFF_AT ]]; then
    touch "$SEGMENT_END_FLAG"
    trigger_continuation
    HANDOFF_TRIGGERED=1
    # Keep streaming briefly so the next runner can connect before we drop
    echo "==> Overlap window ${HANDOFF_SECONDS}s for seamless reconnect"
  fi

  if [[ $ELAPSED -ge $SEGMENT_SECONDS ]]; then
    echo "==> Segment time budget reached"
    break
  fi

  sleep 10
done

if ! kill -0 "$FFMPEG_PID" 2>/dev/null; then
  echo "ERROR: FFmpeg exited early — see /tmp/ffmpeg.log" >&2
  tail -n 50 /tmp/ffmpeg.log || true
  exit 1
fi

echo "==> Stopping FFmpeg for this segment"
kill "$FFMPEG_PID" 2>/dev/null || true
wait "$FFMPEG_PID" 2>/dev/null || true
echo "==> Segment complete"
