// Playground Controller — Friends / Groups / Chat / Share

class PlaygroundController {
  constructor() {
    this.currentView = 'friends';
    this.selectedChatGroupId = null;
    this.cachedGroups = [];
    this.init();
  }

  async init() {
    this.applyEmbedMode();
    if (typeof hydrateIcons === 'function') hydrateIcons();
    this.bindEvents();
    await this.switchView('friends');
  }

  applyEmbedMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('embed') === '1') document.body.classList.add('embed-mode');
  }

  bindEvents() {
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
    });

    // Friends
    document.getElementById('addFriendBtn').addEventListener('click', () => this.sendFriendRequest());
    document.getElementById('friendUsernameInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendFriendRequest();
    });

    // Groups
    document.getElementById('createGroupBtn').addEventListener('click', () => this.createGroup());
    document.getElementById('newGroupName').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createGroup();
    });
    document.getElementById('joinByCodeBtn').addEventListener('click', () => this.joinByCode());
    document.getElementById('joinCodeInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.joinByCode();
    });

    // Chat
    document.getElementById('chatSendBtn').addEventListener('click', () => this.sendChatMessage());
    document.getElementById('chatInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.sendChatMessage();
    });

    // Share
    document.getElementById('shareKind').addEventListener('change', () => this.updateShareForm());
    document.getElementById('sendShareBtn').addEventListener('click', () => this.sendShare());
  }

  async switchView(view) {
    this.currentView = view;
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    ['friendsView', 'groupsView', 'chatView', 'shareView'].forEach(id => {
      document.getElementById(id).classList.toggle('hidden', id !== `${view}View`);
    });
    if (view === 'friends') await this.loadFriends();
    else if (view === 'groups') await this.loadGroups();
    else if (view === 'chat') await this.loadChatGroups();
    else if (view === 'share') await this.loadShareForm();
  }

  // === FRIENDS ===
  async sendFriendRequest() {
    const input = document.getElementById('friendUsernameInput');
    const username = input.value.trim().toLowerCase();
    if (!username) return;
    try {
      await api.authedFetch('/friends/request', { method: 'POST', body: { username } });
      input.value = '';
      alert('Friend request sent.');
      await this.loadFriends();
    } catch (err) {
      alert(err.message || 'Failed to send request');
    }
  }

  async loadFriends() {
    try {
      const [reqs, friends] = await Promise.all([
        api.authedFetch('/friends/requests'),
        api.authedFetch('/friends')
      ]);
      this.renderIncoming(reqs.incoming || []);
      this.renderFriends(friends.friends || []);
    } catch (err) {
      console.error(err);
    }
  }

  async renderIncoming(list) {
    const wrap = document.getElementById('incomingFriendsList');
    wrap.replaceChildren();
    if (list.length === 0) {
      wrap.innerHTML = '<div class="empty-state-small"><p>No incoming requests</p></div>';
      return;
    }
    // Need usernames — fetch via fallback (not currently exposed).
    for (const f of list) {
      const row = document.createElement('div');
      row.className = 'list-row';
      row.innerHTML = `
        <span>Request from user <code>${f.requesterId}</code></span>
        <button class="btn btn-sm btn-primary" data-act="accept">Accept</button>
      `;
      row.querySelector('[data-act="accept"]').addEventListener('click', async () => {
        try {
          await api.authedFetch(`/friends/${f.id}/accept`, { method: 'POST' });
          await this.loadFriends();
        } catch (err) { alert(err.message); }
      });
      wrap.appendChild(row);
    }
  }

  renderFriends(list) {
    const wrap = document.getElementById('friendsList');
    wrap.replaceChildren();
    if (list.length === 0) {
      wrap.innerHTML = '<div class="empty-state-small"><p>No friends yet</p></div>';
      return;
    }
    for (const f of list) {
      const row = document.createElement('div');
      row.className = 'list-row';
      const name = document.createElement('span');
      name.textContent = `@${f.username}`;
      const remove = document.createElement('button');
      remove.className = 'btn btn-sm btn-danger-outline';
      remove.textContent = 'Remove';
      // Removal needs friendship id — not in `/friends` response. Skip for now.
      remove.disabled = true;
      remove.title = 'Friend removal not yet wired';
      row.append(name, remove);
      wrap.appendChild(row);
    }
  }

  // === GROUPS ===
  async createGroup() {
    const input = document.getElementById('newGroupName');
    const name = input.value.trim();
    if (!name) return;
    try {
      const res = await api.authedFetch('/groups', { method: 'POST', body: { name } });
      input.value = '';
      await this.loadGroups();
      alert(`Group created. Invite code: ${res.group.inviteCode}`);
    } catch (err) {
      alert(err.message || 'Failed');
    }
  }

  async joinByCode() {
    const input = document.getElementById('joinCodeInput');
    const code = input.value.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await api.authedFetch('/groups/join-by-code', { method: 'POST', body: { code } });
      input.value = '';
      if (res.alreadyMember) alert(`Already a member of "${res.group.name}".`);
      else alert(`Joined "${res.group.name}".`);
      await this.loadGroups();
    } catch (err) {
      alert(err.message || 'Failed');
    }
  }

  async loadGroups() {
    try {
      const res = await api.authedFetch('/groups');
      this.cachedGroups = res.groups || [];
      this.renderGroups(this.cachedGroups);
    } catch (err) {
      console.error(err);
    }
  }

  renderGroups(list) {
    const wrap = document.getElementById('groupsList');
    wrap.replaceChildren();
    if (list.length === 0) {
      wrap.innerHTML = '<div class="empty-state-small"><p>No groups yet</p></div>';
      return;
    }
    for (const g of list) {
      const row = document.createElement('div');
      row.className = 'list-row group-row';
      row.innerHTML = `
        <div class="group-row-main">
          <strong>${escapeText(g.name)}</strong>
          <div class="group-meta">Invite: <code class="invite-code">${g.inviteCode || '—'}</code></div>
        </div>
        <button class="btn btn-sm btn-outline" data-act="copy">Copy code</button>
        <button class="btn btn-sm btn-secondary" data-act="chat">Open chat</button>
      `;
      row.querySelector('[data-act="copy"]').addEventListener('click', async () => {
        if (!g.inviteCode) return;
        try { await navigator.clipboard.writeText(g.inviteCode); } catch (_) {}
      });
      row.querySelector('[data-act="chat"]').addEventListener('click', () => {
        this.selectedChatGroupId = g.id;
        this.switchView('chat');
      });
      wrap.appendChild(row);
    }
  }

  // === CHAT ===
  async loadChatGroups() {
    try {
      const res = await api.authedFetch('/groups');
      this.cachedGroups = res.groups || [];
    } catch (err) {
      console.error(err);
    }
    const wrap = document.getElementById('chatGroupsList');
    wrap.replaceChildren();
    if (this.cachedGroups.length === 0) {
      wrap.innerHTML = '<div class="empty-state-small"><p>No groups</p></div>';
      return;
    }
    for (const g of this.cachedGroups) {
      const row = document.createElement('div');
      row.className = 'list-row chat-group-row' + (g.id === this.selectedChatGroupId ? ' selected' : '');
      row.textContent = g.name;
      row.addEventListener('click', () => {
        this.selectedChatGroupId = g.id;
        this.loadChatGroups();
        this.loadChatMessages();
      });
      wrap.appendChild(row);
    }
    if (this.selectedChatGroupId) await this.loadChatMessages();
  }

  async loadChatMessages() {
    const header = document.getElementById('chatHeader');
    const composer = document.getElementById('chatComposer');
    const messagesEl = document.getElementById('chatMessages');
    if (!this.selectedChatGroupId) {
      header.textContent = 'Select a group';
      composer.hidden = true;
      messagesEl.replaceChildren();
      return;
    }
    const g = this.cachedGroups.find(g => g.id === this.selectedChatGroupId);
    header.textContent = g ? g.name : 'Chat';
    composer.hidden = false;
    try {
      const res = await api.authedFetch(`/groups/${this.selectedChatGroupId}/chat?limit=100`);
      this.renderMessages(res.messages || []);
    } catch (err) {
      console.error(err);
    }
  }

  renderMessages(list) {
    const wrap = document.getElementById('chatMessages');
    wrap.replaceChildren();
    const me = (auth.getCurrentUser ? null : null); // placeholder
    for (const m of list) {
      const card = document.createElement('div');
      card.className = 'chat-msg';
      const sender = document.createElement('div');
      sender.className = 'chat-sender';
      sender.textContent = `@${m.senderUsername || m.senderId.slice(-4)}`;
      const body = document.createElement('div');
      body.className = 'chat-body';
      if (m.kind === 'text') {
        body.textContent = m.text || '';
      } else if (m.kind === 'url') {
        const a = document.createElement('a');
        a.href = m.url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = m.title || m.url;
        body.appendChild(a);
        if (m.text) {
          const note = document.createElement('div');
          note.className = 'chat-note';
          note.textContent = m.text;
          body.appendChild(note);
        }
      } else if (m.kind === 'folder') {
        body.textContent = `Folder: ${m.title || ''}`;
        if (m.payload && Array.isArray(m.payload.links)) {
          const ul = document.createElement('ul');
          ul.style.marginTop = '6px';
          for (const link of m.payload.links) {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.href = link.url;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = link.title || link.url;
            li.appendChild(a);
            ul.appendChild(li);
          }
          body.appendChild(ul);
        }
      } else if (m.kind === 'bookmark') {
        const a = document.createElement('a');
        a.href = m.url || '#';
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = `${m.title || m.url || 'Bookmark'}`;
        body.appendChild(a);
      }
      const ts = document.createElement('div');
      ts.className = 'chat-time';
      ts.textContent = new Date(m.createdAt).toLocaleString();
      card.append(sender, body, ts);
      wrap.appendChild(card);
    }
    wrap.scrollTop = wrap.scrollHeight;
  }

  async sendChatMessage() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !this.selectedChatGroupId) return;
    try {
      await api.authedFetch(`/groups/${this.selectedChatGroupId}/chat`, {
        method: 'POST',
        body: { kind: 'text', text }
      });
      input.value = '';
      await this.loadChatMessages();
    } catch (err) {
      alert(err.message);
    }
  }

  // === SHARE ===
  updateShareForm() {
    const kind = document.getElementById('shareKind').value;
    document.getElementById('shareUrlGroup').classList.toggle('hidden', kind !== 'url');
    document.getElementById('shareBookmarkGroup').classList.toggle('hidden', kind !== 'bookmark');
    document.getElementById('shareFolderGroup').classList.toggle('hidden', kind !== 'folder');
  }

  async loadShareForm() {
    this.updateShareForm();
    try {
      const res = await api.authedFetch('/groups');
      this.cachedGroups = res.groups || [];
    } catch (err) { console.error(err); }
    this.renderShareTargets();
    await this.populateShareSelectors();
  }

  renderShareTargets() {
    const wrap = document.getElementById('shareTargets');
    wrap.replaceChildren();
    if (this.cachedGroups.length === 0) {
      wrap.innerHTML = '<div class="empty-state-small"><p>No groups available. Create or join a group first.</p></div>';
      return;
    }
    for (const g of this.cachedGroups) {
      const label = document.createElement('label');
      label.className = 'multi-select-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = g.id;
      cb.dataset.kind = 'group';
      const span = document.createElement('span');
      span.textContent = g.name;
      label.append(cb, span);
      wrap.appendChild(label);
    }
  }

  async populateShareSelectors() {
    const tabs = await storage.getTabs();
    const bmSel = document.getElementById('shareBookmarkSelect');
    const folSel = document.getElementById('shareFolderSelect');
    bmSel.replaceChildren();
    folSel.replaceChildren();

    for (const tab of tabs) {
      const links = await storage.getAllLinks(tab.id);
      const folders = await storage.getFolders(tab.id);
      for (const l of links) {
        const opt = new Option(`[${tab.name}] ${l.title}`, JSON.stringify({ tabId: tab.id, id: l.id, url: l.url, title: l.title, platform: l.platform }));
        bmSel.add(opt);
      }
      for (const f of folders) {
        const opt = new Option(`[${tab.name}] / ${f.name}`, JSON.stringify({ tabId: tab.id, id: f.id, name: f.name }));
        folSel.add(opt);
      }
    }
  }

  async sendShare() {
    const status = document.getElementById('shareStatus');
    status.hidden = true;
    const kind = document.getElementById('shareKind').value;
    const note = document.getElementById('shareNote').value.trim();

    const targets = Array.from(document.querySelectorAll('#shareTargets input[type="checkbox"]:checked'));
    if (targets.length === 0) {
      alert('Select at least one target group.');
      return;
    }
    const groupIds = targets.map(t => t.value);

    let body = { groupIds, text: note || null };
    if (kind === 'url') {
      const url = document.getElementById('shareUrl').value.trim();
      if (!url) { alert('URL required'); return; }
      body.kind = 'url';
      body.url = url;
      body.title = url;
    } else if (kind === 'bookmark') {
      const sel = document.getElementById('shareBookmarkSelect').value;
      if (!sel) { alert('Pick a bookmark'); return; }
      const bm = JSON.parse(sel);
      body.kind = 'bookmark';
      body.url = bm.url;
      body.title = bm.title;
      body.platform = bm.platform;
    } else if (kind === 'folder') {
      const sel = document.getElementById('shareFolderSelect').value;
      if (!sel) { alert('Pick a folder'); return; }
      const fol = JSON.parse(sel);
      const allLinks = await storage.getAllLinks(fol.tabId);
      const folderLinks = allLinks.filter(l => l.folderId === fol.id);
      body.kind = 'folder';
      body.title = fol.name;
      body.payload = {
        folderId: fol.id,
        links: folderLinks.map(l => ({ title: l.title, url: l.url, platform: l.platform }))
      };
    }

    try {
      const res = await api.authedFetch('/share', { method: 'POST', body });
      status.hidden = false;
      status.textContent = `Shared with ${res.shared.length} group${res.shared.length === 1 ? '' : 's'}.`;
    } catch (err) {
      alert(err.message || 'Share failed');
    }
  }
}

function escapeText(s) {
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  new PlaygroundController();
});
