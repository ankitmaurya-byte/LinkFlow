// Social feed — posts, comments, likes. Uses backend /feed endpoints.

(function () {
  if (typeof browser === 'undefined' && typeof chrome !== 'undefined') {
    window.browser = chrome;
  }

  const listEl = document.getElementById('fdList');
  const textEl = document.getElementById('fdText');
  const postBtn = document.getElementById('fdPostBtn');
  const attachBtn = document.getElementById('fdAttachBtn');
  const attachStatus = document.getElementById('fdAttachStatus');

  let me = null;
  let pendingImageUrl = '';

  function escText(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function fmtTime(s) {
    try {
      const d = new Date(s);
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'just now';
      if (diff < 3600) return Math.floor(diff / 60) + 'm';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      if (diff < 86400 * 7) return Math.floor(diff / 86400) + 'd';
      return d.toLocaleDateString();
    } catch { return ''; }
  }
  function initial(name) { return (name || '?').charAt(0).toUpperCase(); }

  async function init() {
    try { me = await auth.getCurrentUser(); } catch (_) {}
    await loadFeed();
  }

  async function loadFeed() {
    listEl.innerHTML = '<div class="fd-empty">Loading…</div>';
    try {
      const res = await api.authedFetch('/feed/posts');
      renderFeed(res.posts || []);
    } catch (err) {
      listEl.innerHTML = `<div class="fd-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }

  function renderFeed(posts) {
    listEl.innerHTML = '';
    if (posts.length === 0) {
      listEl.innerHTML = '<div class="fd-empty">No posts yet. Be the first.</div>';
      return;
    }
    for (const p of posts) listEl.appendChild(renderPost(p));
  }

  function renderPost(p) {
    const card = document.createElement('div');
    card.className = 'fd-post';
    card.dataset.postId = p.id;
    const isMine = me && p.ownerId === me.id;

    card.innerHTML = `
      <div class="fd-post-head">
        <div class="fd-avatar">${escText(initial(p.ownerUsername))}</div>
        <span class="fd-author">@${escText(p.ownerUsername)}</span>
        <span class="fd-time">${fmtTime(p.createdAt)}</span>
        ${isMine ? '<button class="fd-del-btn" data-act="del-post" title="Delete post">×</button>' : ''}
      </div>
      ${p.text ? `<div class="fd-text">${escText(p.text)}</div>` : ''}
      ${p.imageUrl ? `<img class="fd-img" src="${p.imageUrl}" alt="" />` : ''}
      <div class="fd-actions">
        <button class="fd-action ${p.likedByMe ? 'liked' : ''}" data-act="like">
          <span>${p.likedByMe ? '♥' : '♡'}</span>
          <span class="fd-like-count">${p.likeCount}</span>
        </button>
        <button class="fd-action" data-act="comment">
          <span>💬</span>
          <span class="fd-comment-count">${p.commentCount}</span>
        </button>
        <button class="fd-action" data-act="share"><span>↗</span><span>Share</span></button>
      </div>
      <div class="fd-comments" hidden></div>
    `;

    card.querySelector('[data-act="like"]').addEventListener('click', () => toggleLike(p, card));
    card.querySelector('[data-act="comment"]').addEventListener('click', () => toggleComments(p, card));
    card.querySelector('[data-act="share"]').addEventListener('click', () => sharePost(p));
    if (isMine) {
      card.querySelector('[data-act="del-post"]').addEventListener('click', () => deletePost(p, card));
    }
    return card;
  }

  async function toggleLike(p, card) {
    try {
      const res = await api.authedFetch(`/feed/posts/${p.id}/like`, { method: 'POST' });
      p.likedByMe = res.liked;
      p.likeCount = res.likeCount;
      const btn = card.querySelector('[data-act="like"]');
      btn.classList.toggle('liked', res.liked);
      btn.querySelector('span:first-child').textContent = res.liked ? '♥' : '♡';
      card.querySelector('.fd-like-count').textContent = res.likeCount;
    } catch (err) { uiAlert('Like failed: ' + (err.message || err)); }
  }

  async function toggleComments(p, card) {
    const wrap = card.querySelector('.fd-comments');
    if (!wrap.hidden) { wrap.hidden = true; return; }
    wrap.hidden = false;
    wrap.innerHTML = '<div class="fd-empty">Loading…</div>';
    try {
      const res = await api.authedFetch(`/feed/posts/${p.id}/comments`);
      renderComments(p, card, res.comments || []);
    } catch (err) {
      wrap.innerHTML = `<div class="fd-empty">Failed: ${escText(err.message || err)}</div>`;
    }
  }

  function renderComments(p, card, list) {
    const wrap = card.querySelector('.fd-comments');
    wrap.innerHTML = '';
    for (const c of list) wrap.appendChild(renderComment(p, c));

    const form = document.createElement('div');
    form.className = 'fd-comment-form';
    form.innerHTML = `<input type="text" placeholder="Write a comment…" /><button>Send</button>`;
    const input = form.querySelector('input');
    const btn = form.querySelector('button');
    const send = async () => {
      const text = input.value.trim();
      if (!text) return;
      btn.disabled = true;
      try {
        const res = await api.authedFetch(`/feed/posts/${p.id}/comments`, {
          method: 'POST', body: { text }
        });
        wrap.insertBefore(renderComment(p, res.comment), form);
        input.value = '';
        p.commentCount = res.commentCount;
        card.querySelector('.fd-comment-count').textContent = res.commentCount;
      } catch (err) { uiAlert('Comment failed: ' + (err.message || err)); }
      btn.disabled = false;
    };
    btn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    wrap.appendChild(form);
  }

  function renderComment(p, c) {
    const row = document.createElement('div');
    row.className = 'fd-comment';
    const isMine = me && c.ownerId === me.id;
    row.innerHTML = `
      <div class="fd-avatar">${escText(initial(c.ownerUsername))}</div>
      <div class="fd-comment-body">
        <span class="fd-comment-author">@${escText(c.ownerUsername)}</span>
        <span>${escText(c.text)}</span>
        <span class="fd-comment-time">${fmtTime(c.createdAt)}</span>
        ${isMine ? '<button class="fd-comment-del">×</button>' : ''}
      </div>
    `;
    if (isMine) {
      row.querySelector('.fd-comment-del').addEventListener('click', async () => {
        if (!await uiConfirm('Delete comment?')) return;
        try {
          await api.authedFetch(`/feed/posts/${p.id}/comments/${c.id}`, { method: 'DELETE' });
          row.remove();
          p.commentCount = Math.max(0, p.commentCount - 1);
          const card = document.querySelector(`.fd-post[data-post-id="${p.id}"]`);
          if (card) card.querySelector('.fd-comment-count').textContent = p.commentCount;
        } catch (err) { uiAlert('Delete failed: ' + (err.message || err)); }
      });
    }
    return row;
  }

  async function sharePost(p) {
    const url = (api.base || '') + '/feed/posts/' + p.id;
    try {
      await navigator.clipboard.writeText(p.text || url);
      uiAlert('Post text copied to clipboard.');
    } catch (_) {
      uiAlert('Could not copy.');
    }
  }

  async function deletePost(p, card) {
    if (!await uiConfirm('Delete this post?')) return;
    try {
      await api.authedFetch(`/feed/posts/${p.id}`, { method: 'DELETE' });
      card.remove();
    } catch (err) { uiAlert('Delete failed: ' + (err.message || err)); }
  }

  // === Compose ===
  postBtn.addEventListener('click', async () => {
    const text = textEl.value.trim();
    if (!text && !pendingImageUrl) return;
    postBtn.disabled = true;
    try {
      const res = await api.authedFetch('/feed/posts', {
        method: 'POST', body: { text, imageUrl: pendingImageUrl }
      });
      textEl.value = '';
      pendingImageUrl = '';
      attachStatus.textContent = '';
      const empty = listEl.querySelector('.fd-empty');
      if (empty) empty.remove();
      listEl.insertBefore(renderPost(res.post), listEl.firstChild);
    } catch (err) { uiAlert('Post failed: ' + (err.message || err)); }
    postBtn.disabled = false;
  });

  attachBtn.addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      attachStatus.textContent = 'Uploading…';
      try {
        const sig = await api.authedFetch('/upload/sign', { method: 'POST', body: {} });
        const fd = new FormData();
        fd.append('file', f);
        fd.append('api_key', sig.apiKey);
        fd.append('timestamp', sig.timestamp);
        fd.append('signature', sig.signature);
        if (sig.folder) fd.append('folder', sig.folder);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
          method: 'POST', body: fd
        });
        const data = await res.json();
        if (!data.secure_url) throw new Error(data.error?.message || 'upload failed');
        pendingImageUrl = data.secure_url;
        attachStatus.textContent = '✓ image attached';
      } catch (err) {
        attachStatus.textContent = 'failed';
        uiAlert('Upload failed: ' + (err.message || err));
      }
    };
    input.click();
  });

  textEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') postBtn.click();
  });

  init();
})();
