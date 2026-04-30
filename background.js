const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQtmYbiCts4N-LbpYey3tIsLcXhFDOYwiz-58cFaF50BE5I7lP8qifuXxb1jP7_SsyyfoDW1z3ioLNq/pub?gid=0&single=true&output=csv";

const CUTOFF = new Date("2023-12-01");
const REFRESH_HOURS = 12;

const COL = { NAME: 0, VIDEO_LINK: 2, DATE: 3, EXTRA_LINKS: 8, VIDEO_ID: 10 };

function parseDate(s) {
  if (!s) return null;
  s = s.trim();
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function fetchSheet() {
  const res = await fetch(SHEET_URL, { credentials: "omit" });
  const text = await res.text();
  const rows = parseCSV(text);

  console.log("[Alabuga] всего строк CSV:", rows.length);

  const byChannel = new Map();
  let totalVideos = 0;

  for (const cells of rows) {
    if (cells.length < 11) continue;

    const name       = (cells[COL.NAME] || "").trim();
    const dateStr    = (cells[COL.DATE] || "").trim();
    const videoLink  = (cells[COL.VIDEO_LINK] || "").trim();
    const extraLinks = (cells[COL.EXTRA_LINKS] || "").trim();
    const videoId    = (cells[COL.VIDEO_ID] || "").trim();

    // пропускаем заголовки и пустые
    if (!name || name === "Канал" || name === "Описание") continue;

    const date = parseDate(dateStr);
    if (!date || date < CUTOFF) continue;

    // собираем все videoId из ячейки ID + ссылок
    const all = videoLink + " " + extraLinks;
    const ids = new Set([
      ...[...all.matchAll(/[?&]v=([\w-]{11})/g)].map(m => m[1]),
      ...[...all.matchAll(/youtu\.be\/([\w-]{11})/g)].map(m => m[1]),
    ]);
    if (/^[\w-]{11}$/.test(videoId)) ids.add(videoId);

    if (ids.size === 0) continue;

    const key = name.toLowerCase();
    if (!byChannel.has(key)) {
      byChannel.set(key, { name: key, channelId: "", videoIds: new Set(), lastAd: date });
    }
    const entry = byChannel.get(key);
    for (const id of ids) entry.videoIds.add(id);
    if (date > entry.lastAd) entry.lastAd = date;
    totalVideos += ids.size;
  }

  const entries = [...byChannel.values()].map(e => ({
    name: e.name,
    channelId: e.channelId,
    videoIds: [...e.videoIds],
    lastAd: e.lastAd.toISOString().slice(0, 10),
  }));

  console.log("[Alabuga] каналов после фильтра:", entries.length);
  console.log("[Alabuga] всего видео-ID:", entries.reduce((a, e) => a + e.videoIds.length, 0));
  console.log("[Alabuga] пример:", entries[0]);

  return entries;
}

async function refresh() {
  try {
    const list = await fetchSheet();
    await chrome.storage.local.set({ list, updatedAt: Date.now() });
    console.log("[Alabuga] помеченных каналов:", list.length);
  } catch (e) {
    console.error("[Alabuga] fetch error:", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  refresh();
  chrome.alarms.create("refresh", { periodInMinutes: REFRESH_HOURS * 60 });
});
chrome.runtime.onStartup.addListener(refresh);
chrome.alarms.onAlarm.addListener(a => a.name === "refresh" && refresh());