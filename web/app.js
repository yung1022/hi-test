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

function widgetMap(cfg) {
  const map = {};
  for (const w of cfg.widgets || []) map[w.type] = w;
  return map;
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

  const w = widgetMap(cfg);
  $("#w-status").checked = !!w.status?.enabled;
  $("#w-status-label").value = w.status?.label || "ON AIR";
  $("#w-clock").checked = !!w.clock?.enabled;
  $("#w-clock-tz").value = w.clock?.timezone || "UTC";
  $("#w-ticker").checked = !!w.ticker?.enabled;
  $("#w-ticker-text").value = w.ticker?.text || "";
  $("#w-text").checked = !!w.text?.enabled;
  $("#w-text-value").value = w.text?.text || "";
  $("#w-iframe").checked = !!w.iframe?.enabled;
  $("#w-iframe-url").value = w.iframe?.url || "";

  $("#v-width").value = cfg.video?.width || 1280;
  $("#v-height").value = cfg.video?.height || 720;
  $("#v-fps").value = cfg.video?.fps || 30;
  $("#v-bitrate").value = cfg.video?.bitrate || "2500k";
}

function readSceneForm() {
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
    widgets: [
      {
        id: "clock",
        type: "clock",
        enabled: $("#w-clock").checked,
        position: "top-right",
        timezone: $("#w-clock-tz").value.trim() || "UTC",
        format: "24h",
      },
      {
        id: "ticker",
        type: "ticker",
        enabled: $("#w-ticker").checked,
        position: "bottom",
        text: $("#w-ticker-text").value.trim(),
      },
      {
        id: "status",
        type: "status",
        enabled: $("#w-status").checked,
        position: "top-left",
        label: $("#w-status-label").value.trim() || "ON AIR",
      },
      {
        id: "custom-text",
        type: "text",
        enabled: $("#w-text").checked,
        position: "center",
        text: $("#w-text-value").value.trim(),
      },
      {
        id: "iframe",
        type: "iframe",
        enabled: $("#w-iframe").checked,
        position: "full",
        url: $("#w-iframe-url").value.trim(),
      },
    ],
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
bootLocalConfig();

if (loadConnection()?.token) {
  verifyConnection().catch(() => setConnState("Disconnected", false));
}
