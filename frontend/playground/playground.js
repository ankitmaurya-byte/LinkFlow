// Chats view — unified list of DMs + group chats with user search + friend requests.

class ChatsController {
  constructor() {
    this.currentChat = null; // { id, isDm, peerUsername, name }
    this.chats = [];
    this.searchTimer = null;
    this.init();
  }

  async init() {
    this.applyEmbedMode();
    if (typeof hydrateIcons === 'function') hydrateIcons();
    this.bindEvents();
    await Promise.all([this.loadChats(), this.loadRequests()]);
  }

  applyEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') document.body.classList.add('embed-mode');
  }

  bindEvents() {
    const search = document.getElementById('chSearch');
    search.addEventListener('input', () => {
      if (this.searchTimer) clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => this.search(search.value.trim()), 200);
    });

    document.getElementById('chSendBtn').addEventListener('click', () => this.send());
    document.getElementById('chInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.send();
    });
    document.getElementById('chShareBtn').addEventListener('click', () => this.openShareModal());

    document.getElementById('chNewGroupBtn').addEventListener('click', () => {
      document.getElementById('newGroupName').value = '';
      modalManager.open('newGroupModal');
    });
    document.getElementById('newGroupCreateBtn').addEventListener('click', () => this.createGroup());

    document.getElementById('chJoinBtn').addEventListener('click', () => this.joinByCode());
    document.getElementById('chJoinCode').addEventListener('keydown', e => {
      if (e.key === 'Enter') this.joinByCode();
    });

    document.getElementById('stcKind').addEventListener('change', () => this.updateShareForm());
    document.getElementById('stcSendBtn').addEventListener('click', () => this.sendShareToChat());
  }

  // === SEARCH ===
  async search(q) {
    const wrap = document.getElementById('chSearchResults');
    const list = document.getElementById('chSearchList');
    if (!q) { wrap.hidden = true; list.innerHTML = ''; return; }
    list.innerHTML = '<div class="ch-empty">Searching…</div>';
    wrap.hidden = false;
    try {
      const res = await api.authedFetch('/users/search?q=' + encodeURIComponent(q));
      const users = res.users || [];
      list.innerHTML = '';
      if (!users.length) { list.innerHTML = '<div class="ch-empty">No users found.</div>'; return; }
      for (const u of users) list.appendChild(this.renderUserResult(u));
    } catch (err) {
      list.innerHTML = `<div class="ch-empty">Failed: ${esc(err.message || err)}</div>`;
    }
  }

  renderUserResult(u) {
    const row = document.createElement('div');
    row.className = 'ch-user-row';
    let actionLabel = 'Send request';
    let actionHandler;
    if (u.status === 'friend') { actionLabel = 'Chat'; actionHandler = () => this.openDM(u); }
    else if (u.status === 'requested') { actionLabel = 'Requested'; }
    else if (u.status === 'incoming') { actionLabel = 'Accept'; actionHandler = () => this.acceptRequestByUsername(u.username); }
    else { actionHandler = () => this.sendFriendRequest(u.username); }
    row.innerHTML = `
      <div class="ch-avatar">${esc(initial(u.username))}</div>
      <div class="ch-user-name">@${esc(u.username)}</div>
      <button class="ch-user-act ${actionHandler ? '' : 'disabled'}">${esc(actionLabel)}</button>
    `;
    if (actionHandler) row.querySelector('button').addEventListener('click', actionHandler);
    return row;
  }

  async sendFriendRequest(username) {
    try {
      await api.authedFetch('/friends/request', { method: 'POST', body: { username } });
      uiAlert('Friend request sent.');
      this.search(document.getElementById('chSearch').value.trim());
    } catch (err) { uiAlert(err.message || 'Failed'); }
  }

  // === FRIEND REQUESTS (incoming) ===
  async loadRequests() {
    const wrap = document.getElementById('chRequests');
    const list = document.getElementById('chRequestList');
    try {
      const res = await api.authedFetch('/friends/requests');
      const incoming = res.incoming || [];
      if (!incoming.length) { wrap.hidden = true; return; }
      wrap.hidden = false;
      // Need usernames — search route exposes them; fetch each via reverse — easier: pull /friends + match. Simpler: show id.
      // Re-render with placeholder; usernames not exposed in /friends/requests yet.
      list.innerHTML = '';
      for (const r of incoming) {
        const row = document.createElement('div');
        row.className = 'ch-req-row';
        row.innerHTML = `
          <div class="ch-avatar">?</div>
          <div class="ch-user-name">user <code>${esc(r.requesterId.slice(-6))}</code></div>
          <button class="ch-user-act" data-act="accept">Accept</button>
          <button class="ch-user-act danger" data-act="reject">Reject</button>
        `;
        row.querySelector('[data-act="accept"]').addEventListener('click', async () => {
          try {
            await api.authedFetch(`/friends/${r.id}/accept`, { method: 'POST' });
            await this.loadRequests();
          } catch (err) { uiAlert(err.message); }
        });
        row.querySelector('[data-act="reject"]').addEventListener('click', async () => {
          try {
            await api.authedFetch(`/friends/${r.id}/reject`, { method: 'POST' });
            await this.loadRequests();
          } catch (err) { uiAlert(err.message); }
        });
        list.appendChild(row);
      }
    } catch (_) { wrap.hidden = true; }
  }

  async acceptRequestByUsername(_username) {
    // Fallback path — tell user to use the requests list section.
    uiAlert('See "Friend requests" section above to accept.');
  }

  // === CHAT LIST ===
  async loadChats() {
    const list = document.getElementById('chChatList');
    list.innerHTML = '<div class="ch-empty">Loading…</div>';
    try {
      const res = await api.authedFetch('/groups');
      this.chats = res.groups || [];
      list.innerHTML = '';
      if (!this.chats.length) { list.innerHTML = '<div class="ch-empty">No chats yet.</div>'; return; }
      for (const g of this.chats) list.appendChild(this.renderChatRow(g));
    } catch (err) {
      list.innerHTML = `<div class="ch-empty">Failed: ${esc(err.message || err)}</div>`;
    }
  }

  renderChatRow(g) {
    const row = document.createElement('div');
    row.className = 'ch-chat-row' + (this.currentChat?.id === g.id ? ' selected' : '');
    const label = g.isDm && g.peerUsername ? '@' + g.peerUsername : g.name;
    const subtitle = g.isDm ? 'direct message' : `${g.memberCount || ''} members`;
    row.innerHTML = `
      <div class="ch-avatar ${g.isDm ? 'dm' : ''}">${esc(initial(label))}</div>
      <div class="ch-chat-info">
        <div class="ch-chat-name">${esc(label)}</div>
        <div class="ch-chat-sub">${esc(subtitle)}</div>
      </div>
    `;
    row.addEventListener('click', () => this.openChat(g));
    return row;
  }

  // === DM open: ensures pairwise group, opens chat ===
  async openDM(user) {
    try {
      const res = await api.authedFetch('/groups/dm', { method: 'POST', body: { userId: user.id } });
      // refresh list and open
      await this.loadChats();
      const g = this.chats.find(x => x.id === res.group.id) || res.group;
      this.openChat(g);
    } catch (err) { uiAlert(err.message || 'DM failed'); }
  }

  async openChat(g) {
    this.currentChat = g;
    document.querySelectorAll('.ch-chat-row').forEach(r => r.classList.toggle('selected', r === arguments[0]));
    // Re-render list to update selected style
    const list = document.getElementById('chChatList');
    list.innerHTML = '';
    for (const c of this.chats) list.appendChild(this.renderChatRow(c));

    const head = document.getElementById('chHeader');
    head.textContent = g.isDm && g.peerUsername ? '@' + g.peerUsername : g.name;
    document.getElementById('chComposer').hidden = false;
    await this.loadMessages();
  }

  async loadMessages() {
    const wrap = document.getElementById('chMessages');
    if (!this.currentChat) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<div class="ch-empty">Loading…</div>';
    try {
      const res = await api.authedFetch(`/groups/${this.currentChat.id}/chat?limit=100`);
      this.renderMessages(res.messages || []);
    } catch (err) {
      wrap.innerHTML = `<div class="ch-empty">Failed: ${esc(err.message || err)}</div>`;
    }
  }

  renderMessages(list) {
    const wrap = document.getElementById('chMessages');
    wrap.innerHTML = '';
    for (const m of list) {
      const card = document.createElement('div');
      card.className = 'ch-msg';
      const sender = `@${m.senderUsername || '?'}`;
      let bodyHtml = '';
      if (m.kind === 'text') bodyHtml = esc(m.text || '');
      else if (m.kind === 'url') {
        bodyHtml = `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title || m.url)}</a>`;
        if (m.text) bodyHtml += `<div class="ch-msg-note">${esc(m.text)}</div>`;
      } else if (m.kind === 'folder') {
        bodyHtml = `📁 <strong>${esc(m.title || 'Folder')}</strong>`;
        if (m.payload?.links?.length) {
          bodyHtml += '<ul class="ch-msg-links">' +
            m.payload.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a></li>`).join('') +
            '</ul>';
        }
      } else if (m.kind === 'bookmark') {
        bodyHtml = `🔖 <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title || m.url)}</a>`;
      }
      card.innerHTML = `
        <div class="ch-msg-sender">${esc(sender)}</div>
        <div class="ch-msg-body">${bodyHtml}</div>
        <div class="ch-msg-time">${esc(new Date(m.createdAt).toLocaleString())}</div>
      `;
      wrap.appendChild(card);
    }
    wrap.scrollTop = wrap.scrollHeight;
  }

  async send() {
    const input = document.getElementById('chInput');
    const text = input.value.trim();
    if (!text || !this.currentChat) return;
    try {
      await api.authedFetch(`/groups/${this.currentChat.id}/chat`, {
        method: 'POST', body: { kind: 'text', text }
      });
      input.value = '';
      await this.loadMessages();
    } catch (err) { uiAlert(err.message); }
  }

  // === GROUP create + join ===
  async createGroup() {
    const name = document.getElementById('newGroupName').value.trim();
    if (!name) return;
    try {
      const res = await api.authedFetch('/groups', { method: 'POST', body: { name } });
      modalManager.close('newGroupModal');
      uiAlert(`Group created. Invite code: ${res.group.inviteCode}`);
      await this.loadChats();
    } catch (err) { uiAlert(err.message); }
  }

  async joinByCode() {
    const codeEl = document.getElementById('chJoinCode');
    const code = codeEl.value.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await api.authedFetch('/groups/join-by-code', { method: 'POST', body: { code } });
      codeEl.value = '';
      uiAlert(res.alreadyMember ? `Already in "${res.group.name}".` : `Joined "${res.group.name}".`);
      await this.loadChats();
    } catch (err) { uiAlert(err.message); }
  }

  // === SHARE-to-chat (URL / bookmark / folder) ===
  async openShareModal() {
    if (!this.currentChat) { uiAlert('Open a chat first.'); return; }
    const bmSel = document.getElementById('stcBm');
    const folSel = document.getElementById('stcFolder');
    bmSel.replaceChildren();
    folSel.replaceChildren();
    try {
      const tabs = await storage.getTabs();
      for (const tab of tabs) {
        const links = await storage.getAllLinks(tab.id);
        const folders = await storage.getFolders(tab.id);
        for (const l of links) {
          bmSel.add(new Option(`${l.title || l.url}`, JSON.stringify({ tabId: tab.id, id: l.id, url: l.url, title: l.title, platform: l.platform })));
        }
        for (const f of folders) {
          folSel.add(new Option(`${f.name}`, JSON.stringify({ tabId: tab.id, id: f.id, name: f.name })));
        }
      }
    } catch (_) {}
    document.getElementById('stcUrl').value = '';
    document.getElementById('stcNote').value = '';
    this.updateShareForm();
    modalManager.open('shareToChatModal');
  }

  updateShareForm() {
    const k = document.getElementById('stcKind').value;
    document.getElementById('stcUrlGrp').classList.toggle('hidden', k !== 'url');
    document.getElementById('stcBmGrp').classList.toggle('hidden', k !== 'bookmark');
    document.getElementById('stcFolderGrp').classList.toggle('hidden', k !== 'folder');
  }

  async sendShareToChat() {
    if (!this.currentChat) return;
    const kind = document.getElementById('stcKind').value;
    const note = document.getElementById('stcNote').value.trim();
    let body = { kind, text: note || null };
    if (kind === 'url') {
      const url = document.getElementById('stcUrl').value.trim();
      if (!url) { uiAlert('URL required'); return; }
      body.url = url;
      body.title = url;
    } else if (kind === 'bookmark') {
      const sel = document.getElementById('stcBm').value;
      if (!sel) { uiAlert('Pick a bookmark'); return; }
      const bm = JSON.parse(sel);
      body.url = bm.url; body.title = bm.title; body.platform = bm.platform;
    } else if (kind === 'folder') {
      const sel = document.getElementById('stcFolder').value;
      if (!sel) { uiAlert('Pick a folder'); return; }
      const fol = JSON.parse(sel);
      const allLinks = await storage.getAllLinks(fol.tabId);
      const folderLinks = allLinks.filter(l => l.folderId === fol.id);
      body.title = fol.name;
      body.payload = {
        folderId: fol.id,
        links: folderLinks.map(l => ({ title: l.title, url: l.url, platform: l.platform }))
      };
    }
    try {
      await api.authedFetch(`/groups/${this.currentChat.id}/chat`, { method: 'POST', body });
      modalManager.close('shareToChatModal');
      await this.loadMessages();
    } catch (err) { uiAlert(err.message); }
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function initial(s) { return (s || '?').charAt(0).toUpperCase(); }

document.addEventListener('DOMContentLoaded', () => new ChatsController());
