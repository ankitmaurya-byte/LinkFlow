// Blogs — long-form posts. Own CRUD + public feed (read-only).

(function () {
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = chrome;
  }

  const listEl = document.getElementById('bgList');
  const main = document.getElementById('bgMain');
  let tab = 'mine';
  let mine = [];
  let publicFeed = [];
  let current = null; // { ...blog, _editable: bool }
  let saveTimer = null;

  function escText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function fmtDate(s) {
    try { return new Date(s).toLocaleDateString(); } catch { return ''; }
  }

  document.querySelectorAll('.bg-tab').forEach(b => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      document.querySelectorAll('.bg-tab').forEach(x => x.classList.toggle('active', x === b));
      load();
    });
  });
  document.getElementById('bgNewBtn').addEventListener('click', () => createBlog());

  async function load() {
    listEl.innerHTML = '<div class="bg-empty">Loading…</div>';
    try {
      if (tab === 'mine') {
        const res = await api.authedFetch('/blogs');
        mine = res.blogs || [];
        renderList(mine, true);
      } else {
        const res = await api.authedFetch('/blogs/feed');
        publicFeed = res.blogs || [];
        renderList(publicFeed, false);
      }
    } catch (err) {
      listEl.innerHTML = `<div class="bg-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }

  function renderList(blogs, editable) {
    listEl.innerHTML = '';
    if (blogs.length === 0) {
      listEl.innerHTML = `<div class="bg-empty">${editable ? 'No blogs yet.' : 'No public blogs yet.'}</div>`;
      return;
    }
    for (const b of blogs) {
      const row = document.createElement('div');
      row.className = 'bg-row' + (current?.id === b.id ? ' selected' : '');
      row.innerHTML = `
        <div class="bg-row-title">${escText(b.title || 'Untitled')}</div>
        <div class="bg-row-meta">
          ${editable ? `<span class="${b.isPublic ? 'bg-row-pub' : 'bg-row-priv'}">${b.isPublic ? 'public' : 'private'}</span>` : `<span>@${escText(b.ownerUsername || '?')}</span>`}
          <span>${fmtDate(b.updatedAt || b.createdAt)}</span>
        </div>
      `;
      row.addEventListener('click', () => openBlog(b, editable));
      listEl.appendChild(row);
    }
  }

  async function createBlog() {
    try {
      const res = await api.authedFetch('/blogs', {
        method: 'POST',
        body: { title: 'Untitled', body: '' }
      });
      tab = 'mine';
      document.querySelectorAll('.bg-tab').forEach(x => x.classList.toggle('active', x.dataset.tab === 'mine'));
      await load();
      openBlog(res.blog, true);
    } catch (err) { uiAlert('Create failed: ' + (err.message || err)); }
  }

  async function openBlog(b, editable) {
    current = { ...b, _editable: editable };
    renderEditor();
    renderList(tab === 'mine' ? mine : publicFeed, editable);
  }

  function renderEditor() {
    main.innerHTML = '';
    if (!current) {
      main.innerHTML = '<div class="bg-empty">Select or create a blog.</div>';
      return;
    }
    const b = current;

    if (b._editable) {
      const tb = document.createElement('div');
      tb.className = 'bg-toolbar';
      const pubBtn = document.createElement('button');
      pubBtn.className = 'bg-pub-toggle' + (b.isPublic ? ' on' : '');
      pubBtn.textContent = b.isPublic ? '🌐 Public' : '🔒 Private';
      pubBtn.addEventListener('click', () => togglePublic());
      const coverBtn = document.createElement('button');
      coverBtn.textContent = b.coverImage ? '🖼 Replace cover' : '🖼 Cover image';
      coverBtn.addEventListener('click', () => uploadCover());
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑 Delete';
      delBtn.style.marginLeft = 'auto';
      delBtn.addEventListener('click', () => deleteBlog());
      const status = document.createElement('span');
      status.className = 'bg-status';
      status.id = 'bgStatus';
      tb.append(pubBtn, coverBtn, status, delBtn);
      main.appendChild(tb);

      if (b.isPublic && b.slug) {
        const link = document.createElement('div');
        link.className = 'bg-public-link';
        const url = (api.base || '') + '/public/blogs/' + b.slug;
        link.innerHTML = `Public link: <code>${escText(url)}</code><button>Copy</button>`;
        link.querySelector('button').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(url); link.querySelector('button').textContent = '✓'; }
          catch (_) {}
        });
        main.appendChild(link);
      }
    }

    if (b.coverImage) {
      const cover = document.createElement('div');
      cover.className = 'bg-cover';
      cover.innerHTML = `<img src="${b.coverImage}" alt="" />`;
      main.appendChild(cover);
    }

    if (b._editable) {
      const title = document.createElement('input');
      title.className = 'bg-title-input';
      title.value = b.title || '';
      title.placeholder = 'Title';
      title.addEventListener('input', () => { b.title = title.value; scheduleSave(); });
      main.appendChild(title);

      const meta = document.createElement('div');
      meta.className = 'bg-meta';
      meta.textContent = `by you · ${fmtDate(b.updatedAt || b.createdAt)}`;
      main.appendChild(meta);

      const body = document.createElement('textarea');
      body.className = 'bg-body';
      body.value = b.body || '';
      body.placeholder = 'Write your story…';
      body.addEventListener('input', () => { b.body = body.value; scheduleSave(); });
      main.appendChild(body);
    } else {
      const h = document.createElement('h1');
      h.style.cssText = 'font-size:34px;margin:0 0 8px;font-weight:600;';
      h.textContent = b.title || 'Untitled';
      main.appendChild(h);
      const meta = document.createElement('div');
      meta.className = 'bg-meta';
      meta.textContent = `by @${b.ownerUsername || '?'} · ${fmtDate(b.createdAt)}`;
      main.appendChild(meta);
      const body = document.createElement('div');
      body.className = 'bg-body';
      body.style.whiteSpace = 'pre-wrap';
      body.style.minHeight = 'unset';
      body.textContent = b.body || '';
      main.appendChild(body);
    }
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 700);
  }
  async function flushSave() {
    if (!current?._editable) return;
    try {
      const res = await api.authedFetch(`/blogs/${current.id}`, {
        method: 'PATCH',
        body: { title: current.title, body: current.body }
      });
      Object.assign(current, res.blog);
      const status = document.getElementById('bgStatus');
      if (status) { status.textContent = 'Saved'; setTimeout(() => { status.textContent = ''; }, 1200); }
      // refresh sidebar entry
      const idx = mine.findIndex(x => x.id === current.id);
      if (idx >= 0) mine[idx] = res.blog;
      renderList(mine, true);
    } catch (err) { console.warn('save failed', err); }
  }

  async function togglePublic() {
    if (!current?._editable) return;
    try {
      const res = await api.authedFetch(`/blogs/${current.id}`, {
        method: 'PATCH', body: { isPublic: !current.isPublic }
      });
      Object.assign(current, res.blog);
      const idx = mine.findIndex(x => x.id === current.id);
      if (idx >= 0) mine[idx] = res.blog;
      renderEditor();
      renderList(mine, true);
    } catch (err) { uiAlert('Failed: ' + (err.message || err)); }
  }

  async function deleteBlog() {
    if (!current?._editable) return;
    if (!await uiConfirm('Delete this blog?')) return;
    try {
      await api.authedFetch(`/blogs/${current.id}`, { method: 'DELETE' });
      mine = mine.filter(x => x.id !== current.id);
      current = null;
      renderEditor();
      renderList(mine, true);
    } catch (err) { uiAlert('Delete failed: ' + (err.message || err)); }
  }

  async function uploadCover() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const sig = await api.authedFetch('/upload/sign', { method: 'POST', body: {} });
        const fd = new FormData();
        fd.append('file', f);
        fd.append('api_key', sig.apiKey);
        fd.append('timestamp', sig.timestamp);
        fd.append('signature', sig.signature);
        if (sig.folder) fd.append('folder', sig.folder);
        const r = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, { method: 'POST', body: fd });
        const data = await r.json();
        if (!data.secure_url) throw new Error(data.error?.message || 'upload failed');
        const res = await api.authedFetch(`/blogs/${current.id}`, {
          method: 'PATCH', body: { coverImage: data.secure_url }
        });
        Object.assign(current, res.blog);
        renderEditor();
      } catch (err) { uiAlert('Upload failed: ' + (err.message || err)); }
    };
    input.click();
  }

  load();
})();
