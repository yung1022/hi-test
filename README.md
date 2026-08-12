# LIVE DESK — YouTube livestream via GitHub Actions

Clear-slate project that:

1. **Streams to YouTube** from GitHub-hosted runners (Chromium + Xvfb + FFmpeg → RTMP).
2. **Hands off every ~55 minutes** from `livestream.yml` to `continue-livestream.yml` (and back), so the broadcast keeps going across jobs.
3. Ships a **control website** to store secrets, design the on-air screen, and start/stop the stream.

## Quick start

### 1. Open the control panel

Serve the repo root (needed so `/web` can load `/overlay` + `/config`):

```bash
python3 -m http.server 8765
```

Open [http://127.0.0.1:8765/web/](http://127.0.0.1:8765/web/).

### 2. Connect

In **Connect**, enter:

- GitHub owner / repo
- A PAT with access to **Actions**, **Secrets**, **Variables**, and **Contents** on this repository

Credentials stay in your browser `localStorage` only.

### 3. Secrets

In **Secrets**, push:

| Secret | Purpose |
| --- | --- |
| `YOUTUBE_STREAM_KEY` | YouTube Studio → Go live → Stream key |
| `YOUTUBE_RTMP_URL` | Optional; default `rtmp://a.rtmp.youtube.com/live2` |
| `STREAM_CONTROL_TOKEN` | Optional PAT used by runners to trigger the next workflow + set variables |

Also create a **YouTube live stream** (or scheduled premiere) in YouTube Studio and keep it waiting for the encoder.

### 4. On-air screen

In **On-air screen**, set brand, title, background, optional embedded website, and widgets (ON AIR badge, clock, ticker, custom text, iframe). **Save scene to repo** writes `config/stream-config.json`.

### 5. Start / end

- **Start stream** dispatches `livestream.yml` and sets `STREAM_ACTIVE=true`.
- Near the end of each ~55m segment the runner triggers the **other** workflow so a new job reconnects to the same stream key (short overlap).
- **End stream** sets `STREAM_ACTIVE=false` and cancels in-progress livestream runs.

## Workflows

| File | Role |
| --- | --- |
| `.github/workflows/livestream.yml` | First / odd segments; hands off to `continue-livestream.yml` |
| `.github/workflows/continue-livestream.yml` | Even segments; hands off back to `livestream.yml` |

Manual runs: Actions → workflow → **Run workflow**.

## Local helpers

```bash
bash scripts/dev.sh validate-config
bash scripts/dev.sh serve-overlay
```

## Notes

- GitHub-hosted jobs are capped (~6h max); this design uses **~1h segments** with an explicit cross-workflow handoff.
- YouTube must allow encoder reconnect on the same stream key (default for many live events).
- Embedded third-party sites may block iframes (`X-Frame-Options`); use a page that allows embedding when choosing “Embed website”.
- Prefer a classic/fine-grained PAT as `STREAM_CONTROL_TOKEN` so runners can reliably `gh workflow run` the sibling workflow and update variables.
