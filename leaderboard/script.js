const API_URL = window.LEADERBOARD_API_URL || 'https://the-final-fysc.vercel.app/api/leaderboard';
const grid = document.getElementById('grid');
const errorEl = document.getElementById('error');
const updatedEl = document.getElementById('updated');

function normalizeEntry(item) {
  const subscribers = Number(item?.subscribers ?? item?.subscriberCount ?? item?.subs ?? item?.sub_count ?? 0);
  return {
    ...item,
    name: item?.name || item?.displayName || item?.username || 'Unknown',
    subscribers: Number.isFinite(subscribers) ? subscribers : 0,
    growth: Number(item?.growth ?? 0),
    offlineduration: Number(item?.offlineduration ?? 0),
  };
}

// Offline growth formula supplied by the leaderboard.
function calculateOfflineGrowth(growth, offlineTimestamp, now = Math.floor(Date.now() / 1000)) {
  const x = Number(growth);
  const timestamp = Number(offlineTimestamp);
  const elapsed = now - timestamp;
  if (!Number.isFinite(x) || !Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(elapsed)) return 0;
  return x * (1 - (0.9999 ** (0.2 * Math.max(0, elapsed))));
}

function getLastSubCount(item) {
  return item.subscribers + calculateOfflineGrowth(item.growth, item.offlineduration);
}

function formatNumber(value) {
  return Math.round(value).toLocaleString();
}

function render(entries) {
  // Rank every returned user using the calculated last sub count, then keep the top 50.
  const ranked = entries
    .map(normalizeEntry)
    .map((item) => ({ ...item, lastSubCount: getLastSubCount(item) }))
    .sort((a, b) => b.lastSubCount - a.lastSubCount)
    .slice(0, 50);

  grid.replaceChildren(...ranked.map((item, index) => {
    const cell = document.createElement('article');
    cell.className = 'cell';
    const rank = document.createElement('div');
    rank.className = 'rank';
    rank.textContent = `#${index + 1}`;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = item.name;
    const count = document.createElement('div');
    count.className = 'count';
    count.textContent = formatNumber(item.lastSubCount);
    const raw = document.createElement('div');
    raw.className = 'raw';
    raw.textContent = `Firebase: ${formatNumber(item.subscribers)}`;
    cell.append(rank, name, count, raw);
    return cell;
  }));
  updatedEl.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function load() {
  try {
    const response = await fetch(API_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`API returned HTTP ${response.status}`);
    const data = await response.json();
    const entries = Array.isArray(data) ? data : Object.values(data || {});
    render(entries);
    errorEl.hidden = true;
  } catch (error) {
    console.error(error);
    errorEl.hidden = false;
    errorEl.textContent = `Failed to load leaderboard: ${error.message}`;
  }
}

load();
setInterval(load, 15000);
