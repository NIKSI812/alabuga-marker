(async () => {
  if (!location.hostname.endsWith("youtube.com")) return;

  const { list = [] } = await chrome.storage.local.get("list");
  if (!list.length) return;

  const byName  = new Map(list.map(e => [e.name, e]));
  const byVideo = new Map();
  for (const e of list) for (const v of (e.videoIds || [])) byVideo.set(v, e);

  // CSS один раз
  if (!document.getElementById("alabuga-style")) {
    const style = document.createElement("style");
    style.id = "alabuga-style";
style.textContent = `
      .alabuga-badge {
        display: inline-block !important;
        background: #c0392b !important;
        color: #fff !important;
        font-weight: 700 !important;
        font-size: 11px !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        margin-left: 6px !important;
        vertical-align: middle !important;
        white-space: nowrap !important;
        line-height: 1.3 !important;
        font-family: Roboto, Arial, sans-serif !important;
        width: auto !important;
        height: auto !important;
        max-width: max-content !important;
        max-height: 20px !important;
        flex: 0 0 auto !important;
        align-self: flex-start !important;
        box-sizing: border-box !important;
        position: static !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

function addBadge(el, entry) {
  if (!el || el.dataset.alabugaMarked) return;
  el.dataset.alabugaMarked = "1";
  const span = document.createElement("span");
  span.className = "alabuga-badge";
  span.textContent = "💩 РЕКЛАМИРОВАЛ АЛАБУГУ";
  span.title = `Рекламировал «ОЭЗ Алабуга»${entry?.lastAd ? ". Последняя реклама: " + entry.lastAd : ""}`;
  el.appendChild(span);
}

  function norm(s) {
    return (s || "").trim().toLowerCase();
  }

  // Поиск entry по элементу-ссылке на канал
  function entryFromLink(a) {
    const txt = norm(a.innerText || a.textContent);
    if (txt && byName.has(txt)) return byName.get(txt);
    // по @handle
    const href = a.getAttribute("href") || "";
    const h = href.match(/\/@([^/?#]+)/);
    if (h) {
      const handle = norm(decodeURIComponent(h[1]));
      if (byName.has(handle)) return byName.get(handle);
    }
    return null;
  }

  // 1. Любые ссылки на канал по всему сайту
  function scanChannelLinks(root) {
    const sel = [
      'ytd-channel-name a',
      '#channel-name a',
      'a#channel-name',
      'a.yt-simple-endpoint[href*="/@"]',
      'a.yt-simple-endpoint[href*="/channel/"]',
      'a.yt-simple-endpoint[href*="/c/"]',
      'a.ytd-video-owner-renderer',
      '#owner a',
      '#text-container a',
      'ytd-channel-renderer a#main-link',
      'yt-formatted-string.ytd-channel-name a',
    ].join(',');
    root.querySelectorAll(sel).forEach(a => {
      if (a.dataset.alabugaMarked) return;
      const entry = entryFromLink(a);
      if (entry) addBadge(a, entry);
    });
  }

  // 2. Заголовок канала на странице канала (большой)
  function scanChannelHeader(root) {
    const titles = root.querySelectorAll(
      'yt-formatted-string.ytd-channel-name#text, ' +
      'ytd-channel-name#channel-name yt-formatted-string, ' +
      '#channel-header yt-formatted-string, ' +
      'yt-dynamic-text-view-model h1, ' +
      'h1.dynamic-text-view-model-wiz__h1'
    );
    titles.forEach(t => {
      if (t.dataset.alabugaMarked) return;
      const txt = norm(t.innerText || t.textContent);
      if (txt && byName.has(txt)) addBadge(t, byName.get(txt));
    });
  }

  // 3. Карточка канала в результатах поиска
  function scanSearchChannelCards(root) {
    root.querySelectorAll('ytd-channel-renderer').forEach(card => {
      if (card.dataset.alabugaMarked) return;
      const titleEl = card.querySelector('#title, #channel-title, yt-formatted-string#title');
      const a = card.querySelector('a#main-link, a.channel-link');
      const txt = norm(titleEl?.innerText || titleEl?.textContent);
      let entry = null;
      if (txt && byName.has(txt)) entry = byName.get(txt);
      if (!entry && a) entry = entryFromLink(a);
      if (entry && titleEl) addBadge(titleEl, entry);
    });
  }

  // 4. Превью видео по videoId
  function scanVideoThumbs(root) {
    root.querySelectorAll('a[href*="/watch?v="]').forEach(a => {
      const m = (a.getAttribute("href") || "").match(/[?&]v=([\w-]{11})/);
      if (!m) return;
      const entry = byVideo.get(m[1]);
      if (!entry) return;
      const card = a.closest(
        'ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ' +
        'ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-reel-item-renderer'
      ) || a.parentElement;
      const title = card?.querySelector('#video-title, yt-formatted-string#video-title, a#video-title, h3');
      if (title) addBadge(title, entry);
    });
  }

  // 5. Открытое видео — помечаем владельца
  function scanCurrentVideo() {
    const m = location.href.match(/[?&]v=([\w-]{11})/);
    let entry = m ? byVideo.get(m[1]) : null;

    // Если по videoId не нашли — попробуем по имени владельца
    const owner = document.querySelector(
      'ytd-video-owner-renderer ytd-channel-name yt-formatted-string a, ' +
      '#owner ytd-channel-name a, ' +
      '#upload-info ytd-channel-name a'
    );
    if (!entry && owner) {
      const txt = norm(owner.innerText || owner.textContent);
      if (txt && byName.has(txt)) entry = byName.get(txt);
    }
    if (entry && owner) addBadge(owner, entry);
  }

  function scanAll(root) {
    const r = root && root.nodeType === 1 ? root : document;
    try {
      scanChannelLinks(r);
      scanChannelHeader(r);
      scanSearchChannelCards(r);
      scanVideoThumbs(r);
      scanCurrentVideo();
    } catch (e) { /* ignore */ }
  }

  scanAll();

  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => { if (n.nodeType === 1) scanAll(n); });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(scanAll, 300);
    setTimeout(scanAll, 1000);
    setTimeout(scanAll, 2500);
  });
})();