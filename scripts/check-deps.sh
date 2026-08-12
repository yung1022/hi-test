#!/usr/bin/env bash
set -euo pipefail

echo "==> Installing streaming dependencies"
sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ffmpeg \
  xvfb \
  x11-utils \
  fonts-liberation \
  ca-certificates \
  curl \
  python3

if ! command -v google-chrome >/dev/null 2>&1 && ! command -v chromium-browser >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
  echo "==> Installing Chromium"
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y chromium-browser \
    || sudo DEBIAN_FRONTEND=noninteractive apt-get install -y chromium
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "==> Installing GitHub CLI"
  (type -p wget >/dev/null || sudo apt-get install -y wget) \
    && sudo mkdir -p -m 755 /etc/apt/keyrings \
    && out=$(mktemp) \
    && wget -nv -O"$out" https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    && cat "$out" | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null \
    && sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null \
    && sudo apt-get update -y \
    && sudo apt-get install -y gh
fi

ffmpeg -version | head -n 1
echo "==> Dependencies ready"
