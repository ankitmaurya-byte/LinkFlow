// GitHub explorer — public API. Optional token in localStorage lifts rate limit.

(function () {
  const TOKEN_KEY = 'linkflow.gh.token';
  const API = 'https://api.github.com';
  const list = document.getElementById('ghList');
  const detail = document.getElementById('ghDetail');
  const queryInput = document.getElementById('ghQuery');
  const sortSel = document.getElementById('ghSort');
  let selectedCard = null;

  function token() { return localStorage.getItem(TOKEN_KEY) || ''; }

  async function gh(path) {
    const headers = { 'Accept': 'application/vnd.github+json' };
    const t = token();
    if (t) headers['Authorization'] = `Bearer ${t}`;
    const res = await fetch(API + path, { headers });
    const remaining = res.headers.get('x-ratelimit-remaining');
    const limit = res.headers.get('x-ratelimit-limit');
    if (remaining && limit) showRate(remaining, limit);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`HTTP ${res.status}: ${txt}`);
    }
    return res.json();
  }

  function showRate(remaining, limit) {
    let el = document.querySelector('.gh-rate');
    if (!el) {
      el = document.createElement('div');
      el.className = 'gh-rate';
      document.body.appendChild(el);
    }
    el.textContent = `Rate: ${remaining}/${limit}` + (token() ? '' : ' (set token to raise)');
  }

  function escapeText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString(); } catch { return s; } }

  async function search() {
    const q = queryInput.value.trim();
    if (!q) return;
    list.innerHTML = '<div class="gh-empty">Searching…</div>';
    try {
      const sort = sortSel.value;
      const params = new URLSearchParams({ q, per_page: '30' });
      if (sort !== 'best-match') {
        params.set('sort', sort);
        params.set('order', 'desc');
      }
      const data = await gh('/search/repositories?' + params.toString());
      renderList(data.items || []);
    } catch (err) {
      list.innerHTML = `<div class="gh-empty">Failed: ${escapeText(err.message || err)}</div>`;
    }
  }

  function renderList(repos) {
    list.innerHTML = '';
    if (!repos.length) {
      list.innerHTML = '<div class="gh-empty">No results.</div>';
      return;
    }
    for (const r of repos) {
      const card = document.createElement('div');
      card.className = 'gh-card';
      card.innerHTML = `
        <div class="gh-card-name">${escapeText(r.full_name)}</div>
        <div class="gh-card-desc">${escapeText(r.description || '')}</div>
        <div class="gh-card-meta">
          <span>★ ${r.stargazers_count.toLocaleString()}</span>
          <span>⑂ ${r.forks_count.toLocaleString()}</span>
          ${r.language ? `<span>${escapeText(r.language)}</span>` : ''}
          <span>updated ${fmtDate(r.updated_at)}</span>
        </div>
      `;
      card.addEventListener('click', () => {
        if (selectedCard) selectedCard.classList.remove('selected');
        card.classList.add('selected');
        selectedCard = card;
        openRepo(r);
      });
      list.appendChild(card);
    }
  }

  async function openRepo(r) {
    detail.innerHTML = `
      <h2><a href="${r.html_url}" target="_blank" rel="noopener">${escapeText(r.full_name)}</a></h2>
      <div class="gh-detail-meta">
        <span>★ ${r.stargazers_count.toLocaleString()}</span>
        <span>⑂ ${r.forks_count.toLocaleString()}</span>
        <span>👁 ${r.watchers_count.toLocaleString()}</span>
        <span>Issues: ${r.open_issues_count}</span>
        ${r.language ? `<span>Language: ${escapeText(r.language)}</span>` : ''}
        ${r.license?.spdx_id ? `<span>License: ${escapeText(r.license.spdx_id)}</span>` : ''}
      </div>
      <p style="font-size:14px;line-height:1.5;">${escapeText(r.description || '')}</p>
      <div class="gh-section">
        <h3>Recent commits</h3>
        <div id="ghCommits"><div class="gh-empty">Loading…</div></div>
      </div>
      <div class="gh-section">
        <h3>Open issues</h3>
        <div id="ghIssues"><div class="gh-empty">Loading…</div></div>
      </div>
      <div class="gh-section">
        <h3>Open pull requests</h3>
        <div id="ghPRs"><div class="gh-empty">Loading…</div></div>
      </div>
    `;
    loadCommits(r);
    loadIssues(r);
    loadPRs(r);
  }

  async function loadCommits(r) {
    const wrap = document.getElementById('ghCommits');
    try {
      const list = await gh(`/repos/${r.full_name}/commits?per_page=8`);
      wrap.innerHTML = '';
      for (const c of list) {
        const row = document.createElement('div');
        row.className = 'gh-row';
        const msg = (c.commit.message || '').split('\n')[0];
        row.innerHTML = `
          <a href="${c.html_url}" target="_blank" rel="noopener">${escapeText(msg)}</a>
          <div class="gh-row-meta">${escapeText(c.commit.author?.name || '')} · ${fmtDate(c.commit.author?.date)}</div>
        `;
        wrap.appendChild(row);
      }
      if (!list.length) wrap.innerHTML = '<div class="gh-empty">No commits.</div>';
    } catch (err) {
      wrap.innerHTML = `<div class="gh-empty">Failed: ${escapeText(err.message || err)}</div>`;
    }
  }

  async function loadIssues(r) {
    const wrap = document.getElementById('ghIssues');
    try {
      const items = await gh(`/repos/${r.full_name}/issues?state=open&per_page=8`);
      const issues = items.filter(i => !i.pull_request);
      wrap.innerHTML = '';
      for (const i of issues) {
        const row = document.createElement('div');
        row.className = 'gh-row';
        row.innerHTML = `
          <a href="${i.html_url}" target="_blank" rel="noopener">#${i.number} ${escapeText(i.title)}</a>
          <div class="gh-row-meta">by ${escapeText(i.user?.login || '')} · ${fmtDate(i.created_at)} · ${i.comments} comments</div>
        `;
        wrap.appendChild(row);
      }
      if (!issues.length) wrap.innerHTML = '<div class="gh-empty">No open issues.</div>';
    } catch (err) {
      wrap.innerHTML = `<div class="gh-empty">Failed: ${escapeText(err.message || err)}</div>`;
    }
  }

  async function loadPRs(r) {
    const wrap = document.getElementById('ghPRs');
    try {
      const list = await gh(`/repos/${r.full_name}/pulls?state=open&per_page=8`);
      wrap.innerHTML = '';
      for (const p of list) {
        const row = document.createElement('div');
        row.className = 'gh-row';
        row.innerHTML = `
          <a href="${p.html_url}" target="_blank" rel="noopener">#${p.number} ${escapeText(p.title)}</a>
          <div class="gh-row-meta">by ${escapeText(p.user?.login || '')} · ${fmtDate(p.created_at)}</div>
        `;
        wrap.appendChild(row);
      }
      if (!list.length) wrap.innerHTML = '<div class="gh-empty">No open PRs.</div>';
    } catch (err) {
      wrap.innerHTML = `<div class="gh-empty">Failed: ${escapeText(err.message || err)}</div>`;
    }
  }

  document.getElementById('ghSearchBtn').addEventListener('click', search);
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search();
  });
  sortSel.addEventListener('change', () => {
    if (queryInput.value.trim()) search();
  });

  document.getElementById('ghTokenBtn').addEventListener('click', () => {
    const cur = token();
    const next = window.prompt('GitHub personal access token (leave blank to clear):', cur);
    if (next === null) return;
    if (next.trim()) localStorage.setItem(TOKEN_KEY, next.trim());
    else localStorage.removeItem(TOKEN_KEY);
    if (queryInput.value.trim()) search();
  });

  // Default seed query.
  queryInput.value = 'stars:>10000 language:javascript';
})();
