async function loadConfig() {
  const res = await fetch("../config/stream-config.json", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load stream config");
  return res.json();
}

function unitValue(value, unit, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return unit === "px" ? `${n}px` : `${n}%`;
}

const LEGACY_PRESETS = {
  "top-left": { x: 2.5, y: 3.5, width: 14, height: 8 },
  "top-right": { x: 82, y: 3.5, width: 15, height: 8 },
  "top-center": { x: 35, y: 3.5, width: 30, height: 8 },
  "center": { x: 25, y: 35, width: 50, height: 30 },
  "bottom": { x: 0, y: 90, width: 100, height: 8 },
  "bottom-left": { x: 2.5, y: 78, width: 30, height: 18 },
  "bottom-right": { x: 68, y: 78, width: 30, height: 18 },
  "full": { x: 0, y: 0, width: 100, height: 100 },
  "left-panel": { x: 2, y: 15, width: 28, height: 70 },
  "right-panel": { x: 70, y: 15, width: 28, height: 70 },
};

function resolveBox(widget) {
  if (typeof widget.position === "string" && LEGACY_PRESETS[widget.position]) {
    const p = LEGACY_PRESETS[widget.position];
    return {
      position: { x: p.x, y: p.y, xUnit: "%", yUnit: "%" },
      size: {
        width: widget.size?.width ?? p.width,
        height: widget.size?.height ?? p.height,
        widthUnit: widget.size?.widthUnit || "%",
        heightUnit: widget.size?.heightUnit || "%",
      },
    };
  }
  return {
    position: widget.position || { x: 0, y: 0, xUnit: "%", yUnit: "%" },
    size: widget.size || { width: 20, height: 10, widthUnit: "%", heightUnit: "%" },
  };
}

function applyBox(el, widget) {
  const box = resolveBox(widget);
  const pos = box.position;
  const size = box.size;
  const xUnit = pos.xUnit || "%";
  const yUnit = pos.yUnit || "%";
  const wUnit = size.widthUnit || "%";
  const hUnit = size.heightUnit || "%";

  el.style.left = unitValue(pos.x ?? 0, xUnit, "0%");
  el.style.top = unitValue(pos.y ?? 0, yUnit, "0%");
  el.style.width = unitValue(size.width ?? 20, wUnit, "20%");
  el.style.height = unitValue(size.height ?? 10, hUnit, "10%");
  el.style.zIndex = String(widget.zIndex ?? 5);
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

  const showTitle = cfg.source?.type !== "website" || !cfg.source.url;
  center.classList.toggle("is-hidden", !showTitle || (!cfg.title && !cfg.subtitle));

  if (cfg.source?.type === "website" && cfg.source.url) {
    frame.hidden = false;
    frame.src = cfg.source.url;
  } else {
    frame.hidden = true;
  }
}

function createStatus(widget) {
  const el = document.createElement("div");
  el.className = "widget-status";
  el.innerHTML = `<span class="dot"></span><span></span>`;
  el.querySelector("span:last-child").textContent = widget.label || "ON AIR";
  return el;
}

function createClock(widget) {
  const el = document.createElement("div");
  el.className = "widget-clock";
  const tz = widget.timezone || "UTC";
  const hour12 = widget.format !== "24h";
  const tick = () => {
    el.textContent = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12,
    }).format(new Date());
  };
  tick();
  setInterval(tick, 1000);
  return el;
}

function createTicker(widget) {
  const el = document.createElement("div");
  el.className = "widget-ticker";
  const track = document.createElement("div");
  track.className = "widget-ticker-track";
  const msg = widget.text || "";
  track.textContent = `${msg}   ·   ${msg}   ·   ${msg}   ·   ${msg}`;
  el.appendChild(track);
  return el;
}

function createText(widget) {
  const el = document.createElement("div");
  el.className = "widget-text";
  el.textContent = widget.text || "";
  return el;
}

function createIframe(widget) {
  const el = document.createElement("iframe");
  el.className = "widget-iframe";
  el.title = widget.label || "Widget";
  el.loading = "eager";
  el.referrerPolicy = "no-referrer";
  if (widget.url) el.src = widget.url;
  return el;
}

const factories = {
  status: createStatus,
  clock: createClock,
  ticker: createTicker,
  text: createText,
  iframe: createIframe,
};

function applyWidgets(cfg) {
  const root = document.getElementById("widgets");
  root.innerHTML = "";

  const widgets = (cfg.widgets || []).filter((w) => w && w.enabled !== false);
  for (const widget of widgets) {
    const factory = factories[widget.type];
    if (!factory) continue;
    if (widget.type === "iframe" && !widget.url) continue;

    const shell = document.createElement("div");
    shell.className = `widget widget-type-${widget.type}`;
    shell.dataset.id = widget.id || "";
    applyBox(shell, widget);
    shell.appendChild(factory(widget));
    root.appendChild(shell);
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
