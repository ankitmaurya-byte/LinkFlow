// Newsletters / RSS reader. Subscribe → backend stores. Items via /subscriptions/proxy.

(function () {
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = chrome;
  }

  const listEl = document.getElementById('nlList');
  const main = document.getElementById('nlMain');
  const urlInput = document.getElementById('nlFeedUrl');
  const addBtn = document.getElementById('nlAddBtn');
  let subs = [];
  let current = null;

  function escText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleString(); } catch { return s || ''; }
  }
  function stripTags(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.innerHTML = s;
    return (d.textContent || '').trim();
  }

  async function load() {
    try {
      const res = await api.authedFetch('/subscriptions');
      subs = res.subscriptions || [];
      renderList();
    } catch (err) {
      listEl.innerHTML = `<div class="nl-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }

  function renderList() {
    listEl.innerHTML = '';
    if (subs.length === 0) {
      listEl.innerHTML = '<div class="nl-empty">No subscriptions yet.</div>';
      return;
    }
    for (const s of subs) {
      const row = document.createElement('div');
      row.className = 'nl-sub' + (current?.id === s.id ? ' selected' : '');
      row.innerHTML = `
        <button class="nl-sub-del" title="Unsubscribe">×</button>
        <div class="nl-sub-title">${escText(s.title || 'Feed')}</div>
        <div class="nl-sub-url">${escText(s.feedUrl)}</div>
      `;
      row.addEventListener('click', () => openSub(s));
      row.querySelector('.nl-sub-del').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await uiConfirm('Unsubscribe?')) return;
        try {
          await api.authedFetch(`/subscriptions/${s.id}`, { method: 'DELETE' });
          subs = subs.filter(x => x.id !== s.id);
          if (current?.id === s.id) current = null;
          renderList();
          if (!current) main.innerHTML = '<div class="nl-empty">Subscribe to a feed to start.</div>';
        } catch (err) { uiAlert('Failed: ' + (err.message || err)); }
      });
      listEl.appendChild(row);
    }
  }

  async function openSub(s) {
    current = s;
    renderList();
    main.innerHTML = '<div class="nl-empty">Loading…</div>';
    try {
      const res = await fetch(
        (api.base || '') + '/subscriptions/proxy?url=' + encodeURIComponent(s.feedUrl),
        { headers: { Authorization: 'Bearer ' + (await api.getTokens()).accessToken } }
      );
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const xml = await res.text();
      renderFeed(s, xml);
    } catch (err) {
      main.innerHTML = `<div class="nl-empty">Failed to load feed: ${escText(err.message || err)}</div>`;
    }
  }

  function renderFeed(s, xml) {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) {
      main.innerHTML = '<div class="nl-empty">Could not parse feed.</div>';
      return;
    }
    let feedTitle = doc.querySelector('channel > title, feed > title')?.textContent?.trim()
      || s.title || 'Feed';
    let feedDesc = doc.querySelector('channel > description, feed > subtitle')?.textContent?.trim() || '';

    let items = Array.from(doc.querySelectorAll('item, entry')).slice(0, 50).map(el => ({
      title: el.querySelector('title')?.textContent?.trim() || '(untitled)',
      link: el.querySelector('link')?.getAttribute('href')
            || el.querySelector('link')?.textContent?.trim()
            || el.querySelector('guid')?.textContent?.trim()
            || '',
      pubDate: el.querySelector('pubDate, published, updated')?.textContent?.trim() || '',
      author: el.querySelector('author > name, dc\\:creator, creator')?.textContent?.trim()
              || el.querySelector('author')?.textContent?.trim() || '',
      summary: el.querySelector('description, summary, content')?.textContent?.trim() || ''
    }));

    main.innerHTML = `
      <div class="nl-feed-head">
        <div class="nl-feed-title">${escText(feedTitle)}</div>
        ${feedDesc ? `<div class="nl-feed-desc">${escText(feedDesc.slice(0, 240))}</div>` : ''}
      </div>
      <div id="nlItems"></div>
    `;
    const wrap = document.getElementById('nlItems');
    if (items.length === 0) {
      wrap.innerHTML = '<div class="nl-empty">No items.</div>';
      return;
    }
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'nl-item';
      row.innerHTML = `
        <div class="nl-item-title"><a href="${it.link || '#'}" target="_blank" rel="noopener">${escText(it.title)}</a></div>
        <div class="nl-item-meta">${escText(it.author || '')}${it.author && it.pubDate ? ' · ' : ''}${escText(it.pubDate)}</div>
        <div class="nl-item-snippet">${escText(stripTags(it.summary).slice(0, 280))}</div>
      `;
      wrap.appendChild(row);
    }
  }

  addBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;
    try {
      const res = await api.authedFetch('/subscriptions', {
        method: 'POST',
        body: { feedUrl: url }
      });
      urlInput.value = '';
      subs.unshift(res.subscription);
      renderList();
      openSub(res.subscription);
    } catch (err) { uiAlert('Failed: ' + (err.message || err)); }
  });
  urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });

  load();
})();
