#!/usr/bin/env bash
# Utility helpers for local dry-runs (no YouTube push).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "${1:-}" in
  serve-overlay)
    echo "Serving overlay at http://127.0.0.1:8765/overlay/"
    exec python3 -m http.server 8765 --directory "$ROOT"
    ;;
  validate-config)
    python3 - <<'PY'
import json,sys
from pathlib import Path
cfg=json.loads(Path("config/stream-config.json").read_text())
assert "video" in cfg and "widgets" in cfg
print("config ok:", cfg.get("title"), cfg["video"])
PY
    ;;
  *)
    echo "Usage: $0 {serve-overlay|validate-config}"
    exit 1
    ;;
esac
