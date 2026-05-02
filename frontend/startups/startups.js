// Startup explorer — free sources: Hacker News, Product Hunt RSS, GitHub trending.

(function () {
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = chrome;
  }

  const HN = 'https://hacker-news.firebaseio.com/v0';
  const list = document.getElementById('suList');
  let currentTab = 'hn-top';

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

  document.querySelectorAll('.su-tab').forEach(b => {
    b.addEventListener('click', () => {
      currentTab = b.dataset.tab;
      document.querySelectorAll('.su-tab').forEach(x => x.classList.toggle('active', x === b));
      load();
    });
  });
  document.getElementById('suRefreshBtn').addEventListener('click', load);

  async function load() {
    list.innerHTML = '<div class="su-empty">Loading…</div>';
    try {
      if (currentTab === 'hn-top') await renderHN('topstories');
      else if (currentTab === 'hn-show') await renderHN('showstories');
      else if (currentTab === 'hn-jobs') await renderHN('jobstories');
      else if (currentTab === 'ph') await renderProductHunt();
      else if (currentTab === 'trending') await renderTrending();
    } catch (err) {
      list.innerHTML = `<div class="su-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }

  async function renderHN(kind) {
    const idsRes = await fetch(`${HN}/${kind}.json`);
    const ids = await idsRes.json();
    const top = ids.slice(0, 30);
    const items = await Promise.all(top.map(id =>
      fetch(`${HN}/item/${id}.json`).then(r => r.json()).catch(() => null)
    ));
    list.innerHTML = '';
    items.filter(Boolean).forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'su-row';
      const link = it.url || `https://news.ycombinator.com/item?id=${it.id}`;
      row.innerHTML = `
        <div class="su-rank">${idx + 1}</div>
        <div class="su-body">
          <div class="su-title"><a href="${link}" target="_blank" rel="noopener">${escText(it.title || '')}</a></div>
          <div class="su-meta">
            ${it.score != null ? `<span>▲ ${it.score}</span>` : ''}
            ${it.by ? `<span>by ${escText(it.by)}</span>` : ''}
            ${it.descendants != null ? `<span><a href="https://news.ycombinator.com/item?id=${it.id}" target="_blank" rel="noopener">${it.descendants} comments</a></span>` : ''}
            ${it.time ? `<span>${fmtAgo(it.time)}</span>` : ''}
          </div>
          ${it.text ? `<div class="su-snippet">${escText(stripTags(it.text).slice(0, 280))}</div>` : ''}
        </div>
      `;
      list.appendChild(row);
    });
    if (!list.children.length) list.innerHTML = '<div class="su-empty">No items.</div>';
  }

  async function renderProductHunt() {
    const url = 'https://www.producthunt.com/feed';
    const tokens = await api.getTokens();
    const proxy = (api.base || '') + '/subscriptions/proxy?url=' + encodeURIComponent(url);
    const r = await fetch(proxy, {
      headers: { Authorization: 'Bearer ' + tokens.accessToken }
    });
    if (!r.ok) throw new Error('Proxy HTTP ' + r.status);
    const xml = await r.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const items = Array.from(doc.querySelectorAll('item, entry')).slice(0, 40);
    list.innerHTML = '';
    items.forEach((el, idx) => {
      const title = el.querySelector('title')?.textContent?.trim() || '';
      const link = el.querySelector('link')?.getAttribute('href')
                   || el.querySelector('link')?.textContent?.trim() || '';
      const date = el.querySelector('pubDate, published, updated')?.textContent?.trim() || '';
      const desc = el.querySelector('description, summary, content')?.textContent || '';
      const row = document.createElement('div');
      row.className = 'su-row';
      row.innerHTML = `
        <div class="su-rank">${idx + 1}</div>
        <div class="su-body">
          <div class="su-title"><a href="${link || '#'}" target="_blank" rel="noopener">${escText(title)}</a></div>
          <div class="su-meta">${escText(date)}</div>
          <div class="su-snippet">${escText(stripTags(desc).slice(0, 240))}</div>
        </div>
      `;
      list.appendChild(row);
    });
    if (!list.children.length) list.innerHTML = '<div class="su-empty">No items.</div>';
  }

  async function renderTrending() {
    // Past week, sort by stars.
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
    const items = data.items || [];
    list.innerHTML = '';
    items.forEach((repo, idx) => {
      const row = document.createElement('div');
      row.className = 'su-row';
      row.innerHTML = `
        <div class="su-rank">${idx + 1}</div>
        <div class="su-body">
          <div class="su-title"><a href="${repo.html_url}" target="_blank" rel="noopener">${escText(repo.full_name)}</a></div>
          <div class="su-meta">
            <span>★ ${repo.stargazers_count.toLocaleString()}</span>
            <span>⑂ ${repo.forks_count.toLocaleString()}</span>
            ${repo.language ? `<span>${escText(repo.language)}</span>` : ''}
            <span>created ${(new Date(repo.created_at)).toLocaleDateString()}</span>
          </div>
          ${repo.description ? `<div class="su-snippet">${escText(repo.description)}</div>` : ''}
        </div>
      `;
      list.appendChild(row);
    });
    if (!list.children.length) list.innerHTML = '<div class="su-empty">No trending repos.</div>';
  }

  load();
})();
