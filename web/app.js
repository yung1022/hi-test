import sodium from "https://cdn.jsdelivr.net/npm/libsodium-wrappers@0.7.15/+esm";

const STORAGE_KEY = "live-desk-connection";
const CONFIG_PATH = "config/stream-config.json";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

function loadConnection() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  } catch {
    return null;
  }
}

function saveConnection(conn) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
}

function clearConnection() {
  localStorage.removeItem(STORAGE_KEY);
}

function getConn() {
  const owner = $("#gh-owner").value.trim();
  const repo = $("#gh-repo").value.trim();
  const token = $("#gh-token").value.trim();
  if (!owner || !repo || !token) throw new Error("Connect owner, repo, and PAT first.");
  return { owner, repo, token };
}

function apiBase(conn) {
  return `https://api.github.com/repos/${conn.owner}/${conn.repo}`;
}

async function gh(conn, path, options = {}) {
  const res = await fetch(`${apiBase(conn)}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${conn.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || res.statusText || "GitHub API error";
    throw new Error(`${msg} (${res.status})`);
  }
  return { data, res };
}

function setMsg(text, ok = true) {
  const el = $("#action-msg");
  el.textContent = text;
  el.style.color = ok ? "var(--muted)" : "var(--danger)";
}

function setConnState(text, ok) {
  const el = $("#conn-state");
  el.textContent = text;
  el.style.color = ok ? "var(--ok)" : "var(--muted)";
}

function setStreamState(text, live) {
  const el = $("#stream-state");
  el.textContent = text;
  el.dataset.on = live ? "true" : "false";
}

const WIDGET_PRESETS = {
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

const WIDGET_DEFAULTS = {
  status: {
    label: "ON AIR",
    position: { x: 2.5, y: 3.5, xUnit: "%", yUnit: "%" },
    size: { width: 12, height: 7, widthUnit: "%", heightUnit: "%" },
  },
  clock: {
    timezone: "UTC",
    format: "24h",
    position: { x: 82, y: 3.5, xUnit: "%", yUnit: "%" },
    size: { width: 15, height: 7, widthUnit: "%", heightUnit: "%" },
  },
  ticker: {
    text: "Welcome to the stream",
    position: { x: 0, y: 90, xUnit: "%", yUnit: "%" },
    size: { width: 100, height: 8, widthUnit: "%", heightUnit: "%" },
  },
  text: {
    text: "Custom message",
    position: { x: 25, y: 42, xUnit: "%", yUnit: "%" },
    size: { width: 50, height: 12, widthUnit: "%", heightUnit: "%" },
  },
  iframe: {
    url: "",
    label: "Embed",
    position: { x: 55, y: 20, xUnit: "%", yUnit: "%" },
    size: { width: 40, height: 45, widthUnit: "%", heightUnit: "%" },
  },
};

let widgetsState = [];

function uid(type) {
  return `${type}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeWidget(raw = {}) {
  const type = raw.type || "text";
  const defaults = WIDGET_DEFAULTS[type] || WIDGET_DEFAULTS.text;
  const legacyPosition = typeof raw.position === "string" ? raw.position : null;

  let position = {
    x: raw.position?.x ?? defaults.position.x,
    y: raw.position?.y ?? defaults.position.y,
    xUnit: raw.position?.xUnit || defaults.position.xUnit || "%",
    yUnit: raw.position?.yUnit || defaults.position.yUnit || "%",
  };
  let size = {
    width: raw.size?.width ?? defaults.size.width,
    height: raw.size?.height ?? defaults.size.height,
    widthUnit: raw.size?.widthUnit || defaults.size.widthUnit || "%",
    heightUnit: raw.size?.heightUnit || defaults.size.heightUnit || "%",
  };

  if (legacyPosition && WIDGET_PRESETS[legacyPosition]) {
    const p = WIDGET_PRESETS[legacyPosition];
    position = { x: p.x, y: p.y, xUnit: "%", yUnit: "%" };
    size = { width: p.width, height: p.height, widthUnit: "%", heightUnit: "%" };
  }

  return {
    id: raw.id || uid(type),
    type,
    enabled: raw.enabled !== false,
    zIndex: raw.zIndex ?? 5,
    label: raw.label ?? defaults.label ?? "",
    text: raw.text ?? defaults.text ?? "",
    url: raw.url ?? defaults.url ?? "",
    timezone: raw.timezone ?? defaults.timezone ?? "UTC",
    format: raw.format ?? defaults.format ?? "24h",
    position,
    size,
  };
}

function createWidget(type) {
  return normalizeWidget({ type, ...WIDGET_DEFAULTS[type] });
}

function typeLabel(type) {
  return (
    {
      status: "ON AIR badge",
      clock: "Clock",
      ticker: "Ticker",
      text: "Custom text",
      iframe: "Iframe / website",
    }[type] || type
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function widgetFieldsHtml(widget) {
  if (widget.type === "status") {
    return `<label class="span-4"><span>Badge label</span><input data-field="label" value="${escapeHtml(widget.label)}" /></label>`;
  }
  if (widget.type === "clock") {
    return `
      <label class="span-2"><span>Timezone</span><input data-field="timezone" value="${escapeHtml(widget.timezone)}" /></label>
      <label class="span-2"><span>Format</span>
        <select data-field="format">
          <option value="24h" ${widget.format === "24h" ? "selected" : ""}>24h</option>
          <option value="12h" ${widget.format === "12h" ? "selected" : ""}>12h</option>
        </select>
      </label>`;
  }
  if (widget.type === "ticker" || widget.type === "text") {
    return `<label class="span-4"><span>${widget.type === "ticker" ? "Ticker text" : "Text"}</span><input data-field="text" value="${escapeHtml(widget.text)}" /></label>`;
  }
  if (widget.type === "iframe") {
    return `
      <label class="span-4"><span>Iframe URL</span><input data-field="url" placeholder="https://…" value="${escapeHtml(widget.url)}" /></label>
      <label class="span-2"><span>Label</span><input data-field="label" value="${escapeHtml(widget.label)}" /></label>`;
  }
  return "";
}

function renderWidgetsEditor() {
  const root = $("#widgets-editor");
  if (!widgetsState.length) {
    root.innerHTML = `<p class="empty-widgets">No widgets yet. Add an iframe, badge, clock, ticker, or text block.</p>`;
    return;
  }

  root.innerHTML = widgetsState
    .map((widget, index) => {
      const presetOptions = Object.keys(WIDGET_PRESETS)
        .map((key) => `<option value="${key}">${key}</option>`)
        .join("");
      return `
      <article class="widget-card" data-index="${index}">
        <div class="widget-card-head">
          <div class="widget-card-title">${typeLabel(widget.type)} · <code>${escapeHtml(widget.id)}</code></div>
          <div class="widget-card-actions">
            <label class="check"><input type="checkbox" data-field="enabled" ${widget.enabled ? "checked" : ""} /> Enabled</label>
            <button type="button" class="btn ghost" data-action="duplicate">Duplicate</button>
            <button type="button" class="btn danger" data-action="remove">Remove</button>
          </div>
        </div>
        <div class="widget-grid">
          ${widgetFieldsHtml(widget)}
          <div class="span-4 preset-row">
            <label>
              <span>Position preset</span>
              <select data-action="preset">
                <option value="">Custom</option>
                ${presetOptions}
              </select>
            </label>
            <p class="hint compact">Presets fill X/Y/Width/Height. You can still edit afterward.</p>
          </div>
          <label><span>X</span><input type="number" step="any" data-field="position.x" value="${widget.position.x}" /></label>
          <label><span>Y</span><input type="number" step="any" data-field="position.y" value="${widget.position.y}" /></label>
          <label><span>X unit</span>
            <select data-field="position.xUnit">
              <option value="%" ${widget.position.xUnit === "%" ? "selected" : ""}>%</option>
              <option value="px" ${widget.position.xUnit === "px" ? "selected" : ""}>px</option>
            </select>
          </label>
          <label><span>Y unit</span>
            <select data-field="position.yUnit">
              <option value="%" ${widget.position.yUnit === "%" ? "selected" : ""}>%</option>
              <option value="px" ${widget.position.yUnit === "px" ? "selected" : ""}>px</option>
            </select>
          </label>
          <label><span>Width</span><input type="number" step="any" data-field="size.width" value="${widget.size.width}" /></label>
          <label><span>Height</span><input type="number" step="any" data-field="size.height" value="${widget.size.height}" /></label>
          <label><span>Width unit</span>
            <select data-field="size.widthUnit">
              <option value="%" ${widget.size.widthUnit === "%" ? "selected" : ""}>%</option>
              <option value="px" ${widget.size.widthUnit === "px" ? "selected" : ""}>px</option>
            </select>
          </label>
          <label><span>Height unit</span>
            <select data-field="size.heightUnit">
              <option value="%" ${widget.size.heightUnit === "%" ? "selected" : ""}>%</option>
              <option value="px" ${widget.size.heightUnit === "px" ? "selected" : ""}>px</option>
            </select>
          </label>
          <label><span>Z-index</span><input type="number" data-field="zIndex" value="${widget.zIndex}" /></label>
        </div>
      </article>`;
    })
    .join("");
}

function setNested(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    cur = cur[parts[i]];
  }
  const last = parts[parts.length - 1];
  if (["x", "y", "width", "height", "zIndex"].includes(last) || path.endsWith(".x") || path.endsWith(".y") || path.endsWith(".width") || path.endsWith(".height")) {
    const n = Number(value);
    cur[last] = Number.isNaN(n) ? value : n;
  } else {
    cur[last] = value;
  }
}

function syncWidgetsFromDom() {
  $$("#widgets-editor .widget-card").forEach((card) => {
    const index = Number(card.dataset.index);
    const widget = widgetsState[index];
    if (!widget) return;
    card.querySelectorAll("[data-field]").forEach((input) => {
      const field = input.dataset.field;
      if (input.type === "checkbox") {
        setNested(widget, field, input.checked);
      } else {
        setNested(widget, field, input.value);
      }
    });
  });
}

function fillSceneForm(cfg) {
  $("#brand-name").value = cfg.brand?.name || "LIVE DESK";
  $("#brand-accent").value = cfg.brand?.accent || "#f0a202";
  $("#scene-title").value = cfg.title || "";
  $("#scene-subtitle").value = cfg.subtitle || "";
  $("#bg-type").value = cfg.background?.type || "gradient";
  $("#bg-value").value = cfg.background?.value || "";
  $("#bg-image").value = cfg.background?.imageUrl || "";
  $("#source-type").value = cfg.source?.type || "none";
  $("#source-url").value = cfg.source?.url || "";

  widgetsState = (cfg.widgets || []).map((w) => normalizeWidget(w));
  renderWidgetsEditor();

  $("#v-width").value = cfg.video?.width || 1280;
  $("#v-height").value = cfg.video?.height || 720;
  $("#v-fps").value = cfg.video?.fps || 30;
  $("#v-bitrate").value = cfg.video?.bitrate || "2500k";
}

function readSceneForm() {
  syncWidgetsFromDom();
  return {
    title: $("#scene-title").value.trim(),
    subtitle: $("#scene-subtitle").value.trim(),
    background: {
      type: $("#bg-type").value,
      value: $("#bg-value").value.trim(),
      imageUrl: $("#bg-image").value.trim(),
    },
    source: {
      type: $("#source-type").value,
      url: $("#source-url").value.trim(),
    },
    widgets: widgetsState.map((w) => normalizeWidget(w)),
    brand: {
      name: $("#brand-name").value.trim() || "LIVE DESK",
      accent: $("#brand-accent").value || "#f0a202",
    },
    video: {
      width: Number($("#v-width").value) || 1280,
      height: Number($("#v-height").value) || 720,
      fps: Number($("#v-fps").value) || 30,
      bitrate: $("#v-bitrate").value.trim() || "2500k",
    },
  };
}

function bindWidgetEditor() {
  $("#btn-add-widget").addEventListener("click", () => {
    syncWidgetsFromDom();
    const type = $("#add-widget-type").value;
    widgetsState.push(createWidget(type));
    renderWidgetsEditor();
    setMsg(`Added ${typeLabel(type)} widget.`);
  });

  $("#widgets-editor").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.tagName === "SELECT") return;
    const card = e.target.closest(".widget-card");
    if (!card) return;
    const index = Number(card.dataset.index);
    syncWidgetsFromDom();

    if (btn.dataset.action === "remove") {
      widgetsState.splice(index, 1);
      renderWidgetsEditor();
      setMsg("Widget removed.");
      return;
    }
    if (btn.dataset.action === "duplicate") {
      const copy = normalizeWidget({
        ...widgetsState[index],
        id: uid(widgetsState[index].type),
      });
      // Nudge so duplicates don't stack exactly
      copy.position.x = Number(copy.position.x) + 2;
      copy.position.y = Number(copy.position.y) + 2;
      widgetsState.splice(index + 1, 0, copy);
      renderWidgetsEditor();
      setMsg("Widget duplicated.");
    }
  });

  $("#widgets-editor").addEventListener("change", (e) => {
    const select = e.target.closest("select[data-action='preset']");
    if (!select) return;
    const card = select.closest(".widget-card");
    const index = Number(card.dataset.index);
    const preset = WIDGET_PRESETS[select.value];
    if (!preset) return;
    syncWidgetsFromDom();
    widgetsState[index].position.x = preset.x;
    widgetsState[index].position.y = preset.y;
    widgetsState[index].position.xUnit = "%";
    widgetsState[index].position.yUnit = "%";
    widgetsState[index].size.width = preset.width;
    widgetsState[index].size.height = preset.height;
    widgetsState[index].size.widthUnit = "%";
    widgetsState[index].size.heightUnit = "%";
    renderWidgetsEditor();
    setMsg(`Applied preset “${select.value}”.`);
  });
}

async function encryptSecret(publicKey, secretValue) {
  await sodium.ready;
  const binkey = sodium.from_base64(publicKey, sodium.base64_variants.ORIGINAL);
  const binsec = sodium.from_string(secretValue);
  const encBytes = sodium.crypto_box_seal(binsec, binkey);
  return sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);
}

async function putSecret(conn, name, value) {
  if (!value) return false;
  const { data: keyInfo } = await gh(conn, "/actions/secrets/public-key");
  const encrypted_value = await encryptSecret(keyInfo.key, value);
  await gh(conn, `/actions/secrets/${name}`, {
    method: "PUT",
    body: JSON.stringify({
      encrypted_value,
      key_id: keyInfo.key_id,
    }),
  });
  return true;
}

async function listSecrets(conn) {
  const { data } = await gh(conn, "/actions/secrets?per_page=100");
  return new Set((data.secrets || []).map((s) => s.name));
}

async function refreshSecretChecklist() {
  try {
    const conn = getConn();
    const names = await listSecrets(conn);
    $$("#secret-checklist li").forEach((li) => {
      const key = li.dataset.secret;
      const present = names.has(key);
      li.dataset.present = present ? "true" : "false";
      li.textContent = `${key} — ${present ? "present" : "missing"}`;
    });
  } catch {
    $$("#secret-checklist li").forEach((li) => {
      li.dataset.present = "false";
      li.textContent = `${li.dataset.secret} — unknown`;
    });
  }
}

async function defaultBranch(conn) {
  const { data } = await gh(conn, "");
  return data.default_branch || "main";
}

async function loadSceneFromRepo() {
  const conn = getConn();
  const { data } = await gh(conn, `/contents/${CONFIG_PATH}`);
  const json = JSON.parse(atob(data.content.replace(/\n/g, "")));
  fillSceneForm(json);
  return { json, sha: data.sha };
}

async function saveSceneToRepo() {
  const conn = getConn();
  const cfg = readSceneForm();
  const branch = await defaultBranch(conn);
  let sha;
  try {
    const existing = await gh(conn, `/contents/${CONFIG_PATH}?ref=${encodeURIComponent(branch)}`);
    sha = existing.data.sha;
  } catch {
    sha = undefined;
  }
  const body = {
    message: "Update stream scene config from LIVE DESK",
    content: btoa(unescape(encodeURIComponent(JSON.stringify(cfg, null, 2) + "\n"))),
    branch,
  };
  if (sha) body.sha = sha;
  await gh(conn, `/contents/${CONFIG_PATH}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return cfg;
}

async function setVariable(conn, name, value) {
  try {
    await gh(conn, `/actions/variables/${name}`, {
      method: "PATCH",
      body: JSON.stringify({ name, value: String(value) }),
    });
  } catch {
    await gh(conn, "/actions/variables", {
      method: "POST",
      body: JSON.stringify({ name, value: String(value) }),
    });
  }
}

async function getVariable(conn, name) {
  try {
    const { data } = await gh(conn, `/actions/variables/${name}`);
    return data.value;
  } catch {
    return null;
  }
}

async function refreshStatus() {
  try {
    const conn = getConn();
    const active = await getVariable(conn, "STREAM_ACTIVE");
    const status = await getVariable(conn, "STREAM_STATUS");
    const segment = await getVariable(conn, "STREAM_SEGMENT");
    if (active === "true") {
      setStreamState(`Live · seg ${segment || "?"} · ${status || "live"}`, true);
    } else if (status) {
      setStreamState(status, false);
    } else {
      setStreamState("Idle", false);
    }
  } catch (err) {
    setStreamState("Status unavailable", false);
    setMsg(err.message, false);
  }
}

async function startStream() {
  const conn = getConn();
  const branch = await defaultBranch(conn);
  setMsg("Starting livestream workflow…");
  await setVariable(conn, "STREAM_ACTIVE", "true");
  await setVariable(conn, "STREAM_STATUS", "starting");
  await setVariable(conn, "STREAM_SEGMENT", "1");
  await gh(conn, "/actions/workflows/livestream.yml/dispatches", {
    method: "POST",
    body: JSON.stringify({
      ref: branch,
      inputs: {
        segment: "1",
        reason: "control-panel-start",
      },
    }),
  });
  setStreamState("Starting…", true);
  setMsg("Livestream workflow dispatched. Open the repo Actions tab to watch the run.");
}

async function stopStream() {
  const conn = getConn();
  setMsg("Requesting stream end…");
  await setVariable(conn, "STREAM_ACTIVE", "false");
  await setVariable(conn, "STREAM_STATUS", "stopping");

  // Cancel in-progress livestream workflows for a faster stop
  const { data } = await gh(
    conn,
    "/actions/runs?status=in_progress&per_page=20"
  );
  const targets = (data.workflow_runs || []).filter((run) =>
    /livestream/i.test(run.name || "")
  );
  await Promise.all(
    targets.map((run) =>
      gh(conn, `/actions/runs/${run.id}/cancel`, { method: "POST" }).catch(() => null)
    )
  );
  setStreamState("Stopping…", false);
  setMsg(`Stop signaled. Cancelled ${targets.length} in-progress run(s).`);
}

function bindTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      $$(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      $(`#tab-${tab.dataset.tab}`).classList.add("active");
      if (tab.dataset.tab === "preview") {
        const frame = $("#preview-frame");
        frame.src = `../overlay/index.html?t=${Date.now()}`;
      }
    });
  });
}

function hydrateFromStorage() {
  const saved = loadConnection();
  if (!saved) return;
  $("#gh-owner").value = saved.owner || "";
  $("#gh-repo").value = saved.repo || "";
  $("#gh-token").value = saved.token || "";
}

async function verifyConnection() {
  const conn = getConn();
  saveConnection(conn);
  await gh(conn, "");
  setConnState(`${conn.owner}/${conn.repo}`, true);
  await refreshSecretChecklist();
  await refreshStatus();
  setMsg("Connection verified.");
}

async function bootLocalConfig() {
  try {
    const res = await fetch(`../${CONFIG_PATH}`, { cache: "no-store" });
    if (res.ok) fillSceneForm(await res.json());
  } catch {
    /* ignore when opened without local server */
  }
}

function bindForms() {
  $("#connect-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await verifyConnection();
    } catch (err) {
      setConnState("Disconnected", false);
      setMsg(err.message, false);
    }
  });

  $("#btn-clear-local").addEventListener("click", () => {
    clearConnection();
    $("#gh-token").value = "";
    setConnState("Disconnected", false);
    setMsg("Local credentials cleared.");
  });

  $("#secrets-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const conn = getConn();
      const wrote = [];
      if (await putSecret(conn, "YOUTUBE_STREAM_KEY", $("#yt-key").value.trim())) {
        wrote.push("YOUTUBE_STREAM_KEY");
      }
      if (await putSecret(conn, "YOUTUBE_RTMP_URL", $("#yt-rtmp").value.trim())) {
        wrote.push("YOUTUBE_RTMP_URL");
      }
      if (await putSecret(conn, "STREAM_CONTROL_TOKEN", $("#control-token").value.trim())) {
        wrote.push("STREAM_CONTROL_TOKEN");
      }
      if (!wrote.length) throw new Error("Enter at least one secret value to push.");
      await refreshSecretChecklist();
      setMsg(`Saved secret(s): ${wrote.join(", ")}`);
      $("#yt-key").value = "";
      $("#control-token").value = "";
    } catch (err) {
      setMsg(err.message, false);
    }
  });

  $("#scene-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await saveSceneToRepo();
      setMsg("Scene config committed to the repository.");
    } catch (err) {
      setMsg(err.message, false);
    }
  });

  $("#btn-load-scene").addEventListener("click", async () => {
    try {
      await loadSceneFromRepo();
      setMsg("Loaded scene from repository.");
    } catch (err) {
      setMsg(err.message, false);
    }
  });

  $("#btn-start").addEventListener("click", async () => {
    try {
      await startStream();
    } catch (err) {
      setMsg(err.message, false);
    }
  });

  $("#btn-stop").addEventListener("click", async () => {
    try {
      await stopStream();
    } catch (err) {
      setMsg(err.message, false);
    }
  });

  $("#btn-refresh").addEventListener("click", async () => {
    try {
      await refreshStatus();
      setMsg("Status refreshed.");
    } catch (err) {
      setMsg(err.message, false);
    }
  });
}

bindTabs();
hydrateFromStorage();
bindForms();
bindWidgetEditor();
bootLocalConfig();

if (loadConnection()?.token) {
  verifyConnection().catch(() => setConnState("Disconnected", false));
}
