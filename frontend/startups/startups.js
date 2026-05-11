// Startup explorer — free sources: Hacker News, Product Hunt RSS, GitHub trending.
// Stale-while-revalidate: render cached items instantly, fetch fresh, merge by id.

(function () {
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = chrome;
  }

  const HN = 'https://hacker-news.firebaseio.com/v0';
  const list = document.getElementById('suList');
  const CACHE_PREFIX = 'urlgram.startups.cache.';
  const STALE_NOTE_ID = 'suStaleNote';
  let currentTab = 'hn-top';
  let inflight = false;

  // === utilities ===
  function escText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function stripTags(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.innerHTML = s;
    return (d.textContent || '').trim();
  }
  function fmtAgo(epochSec) {
    if (!epochSec) return '';
    const diff = Date.now() / 1000 - epochSec;
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + 'd ago';
    try { return new Date(epochSec * 1000).toLocaleDateString(); } catch { return ''; }
  }

  // === local cache ===
  function readCache(tab) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + tab) || 'null'); }
    catch { return null; }
  }
  function writeCache(tab, items) {
    try { localStorage.setItem(CACHE_PREFIX + tab, JSON.stringify({ ts: Date.now(), items })); }
    catch (_) {}
  }
  function mergeById(oldItems, freshItems) {
    const seen = new Set();
    const out = [];
    for (const it of freshItems) {
      if (it && it.id && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
    }
    for (const it of oldItems) {
      if (it && it.id && !seen.has(it.id)) { seen.add(it.id); out.push(it); }
    }
    return out.slice(0, 60);
  }

  // === fetchers — each returns Array<{ id, _kind, ...fields }> ===
  async function fetchHN(kind) {
    const idsRes = await fetch(`${HN}/${kind}.json`);
    const ids = await idsRes.json();
    const top = ids.slice(0, 30);
    const items = await Promise.all(top.map(id =>
      fetch(`${HN}/item/${id}.json`).then(r => r.json()).catch(() => null)
    ));
    return items.filter(Boolean).map(it => ({
      id: 'hn-' + it.id,
      _kind: 'hn',
      title: it.title || '',
      url: it.url || `https://news.ycombinator.com/item?id=${it.id}`,
      hnId: it.id,
      score: it.score,
      by: it.by,
      descendants: it.descendants,
      time: it.time,
      text: it.text || ''
    }));
  }

  async function fetchProductHunt() {
    const url = 'https://www.producthunt.com/feed';
    const tokens = await api.getTokens();
    const proxy = (api.base || '') + '/subscriptions/proxy?url=' + encodeURIComponent(url);
    const r = await fetch(proxy, { headers: { Authorization: 'Bearer ' + tokens.accessToken } });
    if (!r.ok) throw new Error('Proxy HTTP ' + r.status);
    const xml = await r.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item, entry')).slice(0, 40);
    return items.map((el, idx) => {
      const link = el.querySelector('link')?.getAttribute('href')
                   || el.querySelector('link')?.textContent?.trim() || '';
      const guid = el.querySelector('guid')?.textContent?.trim() || link || ('idx-' + idx);
      return {
        id: 'ph-' + guid,
        _kind: 'ph',
        title: el.querySelector('title')?.textContent?.trim() || '',
        url: link,
        date: el.querySelector('pubDate, published, updated')?.textContent?.trim() || '',
        desc: el.querySelector('description, summary, content')?.textContent || ''
      };
    });
  }

  async function fetchTrending() {
    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10);
    const q = `created:>${since}`;
    const r = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=30`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`GitHub HTTP ${r.status}: ${txt}`);
    }
    const data = await r.json();
    return (data.items || []).map(repo => ({
      id: 'gh-' + repo.id,
      _kind: 'gh',
      title: repo.full_name,
      url: repo.html_url,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      created: repo.created_at,
      desc: repo.description || ''
    }));
  }

  function fetchTab(tab) {
    if (tab === 'hn-top') return fetchHN('topstories');
    if (tab === 'hn-show') return fetchHN('showstories');
    if (tab === 'hn-jobs') return fetchHN('jobstories');
    if (tab === 'ph') return fetchProductHunt();
    if (tab === 'trending') return fetchTrending();
    return Promise.resolve([]);
  }

  // === renderers ===
  function rowHN(it, idx) {
    return `
      <div class="su-rank">${idx + 1}</div>
      <div class="su-body">
        <div class="su-title"><a href="${escAttr(it.url)}" target="_blank" rel="noopener">${escText(it.title)}</a></div>
        <div class="su-meta">
          ${it.score != null ? `<span>▲ ${it.score}</span>` : ''}
          ${it.by ? `<span>by ${escText(it.by)}</span>` : ''}
          ${it.descendants != null ? `<span><a href="https://news.ycombinator.com/item?id=${it.hnId}" target="_blank" rel="noopener">${it.descendants} comments</a></span>` : ''}
          ${it.time ? `<span>${fmtAgo(it.time)}</span>` : ''}
        </div>
        ${it.text ? `<div class="su-snippet">${escText(stripTags(it.text).slice(0, 280))}</div>` : ''}
      </div>`;
  }
  function rowPH(it, idx) {
    return `
      <div class="su-rank">${idx + 1}</div>
      <div class="su-body">
        <div class="su-title"><a href="${escAttr(it.url || '#')}" target="_blank" rel="noopener">${escText(it.title)}</a></div>
        <div class="su-meta">${escText(it.date)}</div>
        <div class="su-snippet">${escText(stripTags(it.desc).slice(0, 240))}</div>
      </div>`;
  }
  function rowGH(it, idx) {
    return `
      <div class="su-rank">${idx + 1}</div>
      <div class="su-body">
        <div class="su-title"><a href="${escAttr(it.url)}" target="_blank" rel="noopener">${escText(it.title)}</a></div>
        <div class="su-meta">
          <span>★ ${(it.stars || 0).toLocaleString()}</span>
          <span>⑂ ${(it.forks || 0).toLocaleString()}</span>
          ${it.language ? `<span>${escText(it.language)}</span>` : ''}
          ${it.created ? `<span>created ${(new Date(it.created)).toLocaleDateString()}</span>` : ''}
        </div>
        ${it.desc ? `<div class="su-snippet">${escText(it.desc)}</div>` : ''}
      </div>`;
  }
  function escAttr(s) { return escText(s).replace(/"/g, '&quot;'); }

  function renderItems(tab, items, isStale) {
    list.innerHTML = '';
    if (isStale) {
      const note = document.createElement('div');
      note.id = STALE_NOTE_ID;
      note.style.cssText = 'font-size:11px;color:#9297a0;padding:4px 8px;text-align:center;';
      note.textContent = 'Showing cached results — refreshing…';
      list.appendChild(note);
    }
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'su-empty';
      empty.textContent = 'No items.';
      list.appendChild(empty);
      return;
    }
    items.forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'su-row';
      if (it._kind === 'hn') row.innerHTML = rowHN(it, idx);
      else if (it._kind === 'ph') row.innerHTML = rowPH(it, idx);
      else if (it._kind === 'gh') row.innerHTML = rowGH(it, idx);
      list.appendChild(row);
    });
  }

  // === main load (stale-while-revalidate) ===
  async function load() {
    if (inflight) return;
    inflight = true;
    const tab = currentTab;
    const cached = readCache(tab);
    if (cached?.items?.length) {
      renderItems(tab, cached.items, true);
    } else {
      list.innerHTML = '<div class="su-empty">Loading…</div>';
    }
    try {
      const fresh = await fetchTab(tab);
      if (tab !== currentTab) return; // user switched mid-flight
      const merged = mergeById(cached?.items || [], fresh);
      renderItems(tab, merged, false);
      writeCache(tab, merged);
    } catch (err) {
      if (!cached?.items?.length) {
        list.innerHTML = `<div class="su-empty">Failed: ${escText(err.message || err)}</div>`;
      } else {
        const note = document.getElementById(STALE_NOTE_ID);
        if (note) note.textContent = 'Refresh failed — showing cached results.';
      }
    } finally {
      inflight = false;
    }
  }

  document.querySelectorAll('.su-tab').forEach(b => {
    b.addEventListener('click', () => {
      currentTab = b.dataset.tab;
      document.querySelectorAll('.su-tab').forEach(x => x.classList.toggle('active', x === b));
      load();
    });
  });
  document.getElementById('suRefreshBtn').addEventListener('click', load);

  load();
})();
