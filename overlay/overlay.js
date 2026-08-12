async function loadConfig() {
  const res = await fetch("../config/stream-config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load stream config");
  return res.json();
}

function applyBackground(cfg) {
  const bg = document.getElementById("bg");
  const accent = cfg.brand?.accent || "#f0a202";
  document.documentElement.style.setProperty("--accent", accent);

  if (cfg.background?.type === "image" && cfg.background.imageUrl) {
    bg.style.backgroundImage = `url("${cfg.background.imageUrl}")`;
    bg.style.backgroundSize = "cover";
  } else if (cfg.background?.value) {
    bg.style.background = cfg.background.value;
  }
}

function applySource(cfg) {
  const frame = document.getElementById("source-frame");
  const center = document.getElementById("center-copy");
  const title = document.getElementById("title");
  const subtitle = document.getElementById("subtitle");

  document.getElementById("brand").textContent = cfg.brand?.name || "LIVE DESK";
  title.textContent = cfg.title || "";
  subtitle.textContent = cfg.subtitle || "";

  if (cfg.source?.type === "website" && cfg.source.url) {
    frame.hidden = false;
    frame.src = cfg.source.url;
    center.hidden = true;
  } else {
    frame.hidden = true;
    center.hidden = false;
  }
}

function widget(cfg, type) {
  return (cfg.widgets || []).find((w) => w.type === type && w.enabled);
}

function applyWidgets(cfg) {
  const status = widget(cfg, "status");
  const clock = widget(cfg, "clock");
  const ticker = widget(cfg, "ticker");
  const text = widget(cfg, "text");
  const iframe = widget(cfg, "iframe");

  const statusEl = document.getElementById("status-pill");
  if (status) {
    statusEl.hidden = false;
    document.getElementById("status-label").textContent = status.label || "ON AIR";
  }

  const clockEl = document.getElementById("clock");
  if (clock) {
    clockEl.hidden = false;
    const tz = clock.timezone || "UTC";
    const hour12 = clock.format !== "24h";
    const tick = () => {
      clockEl.textContent = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12,
      }).format(new Date());
    };
    tick();
    setInterval(tick, 1000);
  }

  if (ticker) {
    const el = document.getElementById("ticker");
    const track = document.getElementById("ticker-track");
    el.hidden = false;
    const msg = ticker.text || "";
    track.textContent = `${msg}   ·   ${msg}   ·   ${msg}   ·   ${msg}`;
  }

  const custom = document.getElementById("custom-text");
  if (text) {
    custom.hidden = false;
    custom.textContent = text.text || "";
    document.getElementById("center-copy").hidden = false;
  } else {
    custom.hidden = true;
  }

  if (iframe?.url) {
    const frame = document.getElementById("source-frame");
    frame.hidden = false;
    frame.src = iframe.url;
    if (!cfg.source?.url) document.getElementById("center-copy").hidden = true;
  }
}

async function boot() {
  try {
    const cfg = await loadConfig();
    if (cfg.video?.width && cfg.video?.height) {
      document.documentElement.style.setProperty("--stage-w", `${cfg.video.width}px`);
      document.documentElement.style.setProperty("--stage-h", `${cfg.video.height}px`);
      document.getElementById("stage").style.width = `${cfg.video.width}px`;
      document.getElementById("stage").style.height = `${cfg.video.height}px`;
    }
    applyBackground(cfg);
    applySource(cfg);
    applyWidgets(cfg);
  } catch (err) {
    document.body.innerHTML = `<pre style="color:#fff;padding:40px">${err}</pre>`;
  }
}

boot();
