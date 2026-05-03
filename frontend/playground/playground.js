// Chats view — unified list of DMs + group chats with user search + friend requests.

const SLASH_COMMANDS = [
  { cmd: '/send link',   desc: 'Share a custom URL',                    action: 'shareUrl' },
  { cmd: '/send folder', desc: 'Share a saved folder of links',         action: 'shareFolder' },
  { cmd: '/send todo',   desc: 'Share a todo task',                     action: 'shareTodo' },
  { cmd: '/help',        desc: 'List available commands',               action: 'help' }
];
const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🔥', '👀'];

class ChatsController {
  constructor() {
    this.currentChat = null; // { id, isDm, peerUsername, name }
    this.chats = [];
    this.messages = [];
    this.searchTimer = null;
    this.replyTo = null; // { id, senderUsername, text }
    this.popoverMode = null; // 'slash' | 'mention' | 'reactions' | null
    this.popoverItems = [];
    this.popoverIndex = 0;
    this.popoverAnchor = null;
    this.mentionUsers = [];
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
    const input = document.getElementById('chInput');
    input.addEventListener('keydown', (e) => this.onInputKeydown(e));
    input.addEventListener('input', () => this.onInputChange());
    input.addEventListener('blur', () => setTimeout(() => this.hidePopover(), 150));
    document.getElementById('chShareBtn').addEventListener('click', () => this.openShareModal());
    document.getElementById('chReplyClear').addEventListener('click', () => this.clearReply());

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
    const openIt = () => {
      if (this.currentChat?.id === g.id) return;
      this.openChat(g);
    };
    row.addEventListener('click', openIt);
    let hoverTimer = null;
    row.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(openIt, 220);
    });
    row.addEventListener('mouseleave', () => clearTimeout(hoverTimer));
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
    document.getElementById('chComposerWrap').hidden = false;
    this.clearReply();
    await this.loadMessages();
  }

  async loadMessages() {
    const wrap = document.getElementById('chMessages');
    if (!this.currentChat) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<div class="ch-empty">Loading…</div>';
    try {
      const res = await api.authedFetch(`/groups/${this.currentChat.id}/chat?limit=100`);
      this.messages = res.messages || [];
      this.renderMessages();
    } catch (err) {
      wrap.innerHTML = `<div class="ch-empty">Failed: ${esc(err.message || err)}</div>`;
    }
  }

  renderMessages() {
    const wrap = document.getElementById('chMessages');
    wrap.innerHTML = '';
    for (const m of this.messages) wrap.appendChild(this.renderMessageCard(m));
    wrap.scrollTop = wrap.scrollHeight;
  }

  renderMessageCard(m) {
    const card = document.createElement('div');
    card.className = 'ch-msg';
    card.dataset.msgId = m.id;
    const sender = `@${m.senderUsername || '?'}`;

    let replyHtml = '';
    if (m.replyTo) {
      const rSnippet = m.replyTo.text || m.replyTo.title || m.replyTo.url || '';
      replyHtml = `
        <div class="ch-msg-reply" data-reply-id="${esc(m.replyTo.id)}">
          <span class="ch-reply-bar"></span>
          <span class="ch-reply-info">
            <strong>@${esc(m.replyTo.senderUsername || '?')}</strong>
            <span>${esc(rSnippet.slice(0, 120))}</span>
          </span>
        </div>`;
    }

    let bodyHtml = '';
    if (m.kind === 'text') bodyHtml = renderRich(m.text || '');
    else if (m.kind === 'url') {
      bodyHtml = `<a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title || m.url)}</a>`;
      if (m.text) bodyHtml += `<div class="ch-msg-note">${renderRich(m.text)}</div>`;
    } else if (m.kind === 'folder') {
      bodyHtml = `📁 <strong>${esc(m.title || 'Folder')}</strong>`;
      if (m.payload?.links?.length) {
        bodyHtml += '<ul class="ch-msg-links">' +
          m.payload.links.map(l => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || l.url)}</a></li>`).join('') +
          '</ul>';
      }
    } else if (m.kind === 'bookmark') {
      bodyHtml = `🔖 <a href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.title || m.url)}</a>`;
    } else if (m.kind === 'todo') {
      const status = m.payload?.status ? ` · ${esc(m.payload.status)}` : '';
      bodyHtml = `✅ <strong>${esc(m.title || 'Task')}</strong>${status}`;
      if (m.text) bodyHtml += `<div class="ch-msg-note">${renderRich(m.text)}</div>`;
    }

    const reactionsHtml = renderReactionsBar(m.reactions || {});

    card.innerHTML = `
      ${replyHtml}
      <div class="ch-msg-sender">${esc(sender)}</div>
      <div class="ch-msg-body">${bodyHtml}</div>
      ${reactionsHtml}
      <div class="ch-msg-time">${esc(new Date(m.createdAt).toLocaleString())}</div>
      <div class="ch-msg-actions">
        <button data-act="reply" title="Reply">↩</button>
        <button data-act="react" title="React">😊</button>
      </div>`;

    card.addEventListener('dblclick', () => this.startReply(m));
    card.querySelector('[data-act="reply"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.startReply(m);
    });
    card.querySelector('[data-act="react"]').addEventListener('click', (e) => {
      e.stopPropagation();
      this.openReactPicker(m, e.currentTarget);
    });
    card.querySelectorAll('.ch-react-chip').forEach(chip => {
      chip.addEventListener('click', () => this.toggleReact(m, chip.dataset.emoji));
    });

    return card;
  }

  startReply(m) {
    this.replyTo = {
      id: m.id,
      senderUsername: m.senderUsername || '?',
      snippet: (m.text || m.title || m.url || '').slice(0, 200)
    };
    document.getElementById('chReplyName').textContent = '@' + this.replyTo.senderUsername;
    document.getElementById('chReplyText').textContent = this.replyTo.snippet;
    document.getElementById('chReplyPreview').hidden = false;
    document.getElementById('chInput').focus();
  }

  clearReply() {
    this.replyTo = null;
    document.getElementById('chReplyPreview').hidden = true;
  }

  openReactPicker(m, anchor) {
    const items = QUICK_REACTIONS.map(emoji => ({ label: emoji, value: emoji }));
    this.showPopover('reactions', items, anchor, 0);
    this._reactTarget = m;
  }

  async toggleReact(m, emoji) {
    try {
      const res = await api.authedFetch(`/groups/${this.currentChat.id}/chat/${m.id}/react`, {
        method: 'POST', body: { emoji }
      });
      m.reactions = res.reactions || {};
      // Re-render only the affected card
      const card = document.querySelector(`.ch-msg[data-msg-id="${m.id}"]`);
      if (card) card.replaceWith(this.renderMessageCard(m));
    } catch (err) { uiAlert(err.message || 'React failed'); }
  }

  async send() {
    const input = document.getElementById('chInput');
    const raw = input.value.trim();
    if (!raw || !this.currentChat) return;
    if (this.handleSlashOnSend(raw)) { input.value = ''; this.hidePopover(); return; }
    const mentions = extractMentions(raw);
    try {
      const res = await api.authedFetch(`/groups/${this.currentChat.id}/chat`, {
        method: 'POST',
        body: {
          kind: 'text',
          text: raw,
          mentions,
          replyToId: this.replyTo?.id || null
        }
      });
      input.value = '';
      this.clearReply();
      this.hidePopover();
      this.appendMessage(res.message);
    } catch (err) { uiAlert(err.message); }
  }

  appendMessage(m) {
    if (!m) return;
    this.messages.push(m);
    const wrap = document.getElementById('chMessages');
    wrap.appendChild(this.renderMessageCard(m));
    wrap.scrollTop = wrap.scrollHeight;
  }

  handleSlashOnSend(raw) {
    const lower = raw.toLowerCase();
    if (lower === '/help' || lower === '/') {
      const cmds = SLASH_COMMANDS.map(c => `${c.cmd} — ${c.desc}`).join('\n');
      const fmt = [
        '**bold**          → bold',
        '*italic*          → italic',
        '~~strike~~        → strikethrough',
        '__underline__     → underline',
        '`code`            → inline code',
        '@username         → mention'
      ].join('\n');
      uiAlert('COMMANDS\n\n' + cmds + '\n\nFORMATTING\n\n' + fmt);
      return true;
    }
    if (lower.startsWith('/send link')) { this.openShareModal('url'); return true; }
    if (lower.startsWith('/send folder')) { this.openShareModal('folder'); return true; }
    if (lower.startsWith('/send todo')) { this.openTodoPicker(); return true; }
    return false;
  }

  // === COMPOSER POPOVER (slash / mention / react) ===
  onInputChange() {
    const input = document.getElementById('chInput');
    const v = input.value;
    if (v.startsWith('/')) {
      const q = v.slice(1).toLowerCase();
      const items = SLASH_COMMANDS
        .filter(c => c.cmd.slice(1).startsWith(q))
        .map(c => ({ label: `${c.cmd} — ${c.desc}`, value: c.cmd, action: c.action }));
      if (items.length) { this.showPopover('slash', items, input, 0); return; }
    }
    const m = v.match(/(^|\s)@([a-zA-Z0-9_]{0,20})$/);
    if (m) {
      const q = m[2];
      clearTimeout(this._mentionTimer);
      this._mentionTimer = setTimeout(() => this.fetchMentionUsers(q, input), 180);
      return;
    }
    this.hidePopover();
  }

  async fetchMentionUsers(q, anchor) {
    try {
      const res = await api.authedFetch('/users/search?q=' + encodeURIComponent(q || ''));
      const users = (res.users || []).slice(0, 12);
      if (!users.length) { this.hidePopover(); return; }
      const items = users.map(u => ({ label: '@' + u.username, value: u.username }));
      this.showPopover('mention', items, anchor, 0);
    } catch (_) { this.hidePopover(); }
  }

  onInputKeydown(e) {
    const input = document.getElementById('chInput');
    if (this.popoverMode && (this.popoverMode === 'slash' || this.popoverMode === 'mention')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); this.movePopover(1); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); this.movePopover(-1); return; }
      if (e.key === 'Escape')    { e.preventDefault(); this.hidePopover(); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.acceptPopover();
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    if (e.key === 'Escape' && this.replyTo) { this.clearReply(); }
  }

  showPopover(mode, items, anchor, idx) {
    this.popoverMode = mode;
    this.popoverItems = items;
    this.popoverIndex = idx || 0;
    this.popoverAnchor = anchor;
    const pop = document.getElementById('chPopover');
    pop.hidden = false;
    pop.innerHTML = '';
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'ch-popover-row' + (i === this.popoverIndex ? ' active' : '');
      row.textContent = it.label;
      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.popoverIndex = i;
        this.acceptPopover();
      });
      pop.appendChild(row);
    });
  }

  hidePopover() {
    this.popoverMode = null;
    this.popoverItems = [];
    const pop = document.getElementById('chPopover');
    if (pop) { pop.hidden = true; pop.innerHTML = ''; }
  }

  movePopover(delta) {
    if (!this.popoverItems.length) return;
    this.popoverIndex = (this.popoverIndex + delta + this.popoverItems.length) % this.popoverItems.length;
    const pop = document.getElementById('chPopover');
    pop.querySelectorAll('.ch-popover-row').forEach((r, i) => {
      r.classList.toggle('active', i === this.popoverIndex);
    });
  }

  acceptPopover() {
    const item = this.popoverItems[this.popoverIndex];
    if (!item) { this.hidePopover(); return; }
    const input = document.getElementById('chInput');
    if (this.popoverMode === 'slash') {
      // Run command immediately.
      this.hidePopover();
      input.value = '';
      const cmd = SLASH_COMMANDS.find(c => c.cmd === item.value);
      if (!cmd) return;
      if (cmd.action === 'shareUrl')    this.openShareModal('url');
      else if (cmd.action === 'shareFolder') this.openShareModal('folder');
      else if (cmd.action === 'shareTodo')   this.openTodoPicker();
      else if (cmd.action === 'help') this.handleSlashOnSend('/help');
      return;
    }
    if (this.popoverMode === 'mention') {
      const v = input.value;
      const replaced = v.replace(/(^|\s)@([a-zA-Z0-9_]*)$/, `$1@${item.value} `);
      input.value = replaced;
      input.focus();
      this.hidePopover();
      return;
    }
    if (this.popoverMode === 'reactions' && this._reactTarget) {
      const target = this._reactTarget;
      this._reactTarget = null;
      this.hidePopover();
      this.toggleReact(target, item.value);
      return;
    }
    this.hidePopover();
  }

  // === TODO PICKER (for /send todo) ===
  async openTodoPicker() {
    if (!window.storage) { uiAlert('Storage not loaded'); return; }
    let data;
    try { data = await storage.getTodoData(); } catch (_) { uiAlert('Failed to load todos'); return; }
    const tasks = [];
    for (const p of data.projects || []) {
      const projTasks = data.tasks?.[p.id] || [];
      const statuses = data.statuses?.[p.id] || [];
      for (const t of projTasks) {
        const status = statuses.find(s => s.id === t.statusId);
        tasks.push({ projectId: p.id, projectName: p.name, task: t, statusName: status?.name || '' });
      }
    }
    if (!tasks.length) { uiAlert('No todo tasks yet.'); return; }
    const items = tasks.slice(0, 30).map(x => ({
      label: `${x.projectName} · ${x.task.title} (${x.statusName})`,
      value: x
    }));
    this.popoverMode = 'todo';
    this.popoverItems = items;
    this.popoverIndex = 0;
    const pop = document.getElementById('chPopover');
    pop.hidden = false;
    pop.innerHTML = '';
    items.forEach((it, i) => {
      const row = document.createElement('div');
      row.className = 'ch-popover-row';
      row.textContent = it.label;
      row.addEventListener('mousedown', async (e) => {
        e.preventDefault();
        this.hidePopover();
        await this.sendTodo(it.value);
      });
      pop.appendChild(row);
    });
  }

  async sendTodo(t) {
    if (!this.currentChat) return;
    try {
      const res = await api.authedFetch(`/groups/${this.currentChat.id}/chat`, {
        method: 'POST',
        body: {
          kind: 'todo',
          title: t.task.title,
          text: t.task.description || '',
          payload: {
            projectId: t.projectId,
            projectName: t.projectName,
            taskId: t.task.id,
            status: t.statusName,
            priority: t.task.priority || null,
            dueDate: t.task.dueDate || null
          },
          replyToId: this.replyTo?.id || null
        }
      });
      this.clearReply();
      this.appendMessage(res.message);
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
  async openShareModal(defaultKind) {
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
    if (defaultKind === 'url' || defaultKind === 'folder' || defaultKind === 'bookmark') {
      document.getElementById('stcKind').value = defaultKind;
    }
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
    if (this.replyTo?.id) body.replyToId = this.replyTo.id;
    try {
      const res = await api.authedFetch(`/groups/${this.currentChat.id}/chat`, { method: 'POST', body });
      modalManager.close('shareToChatModal');
      this.clearReply();
      this.appendMessage(res.message);
    } catch (err) { uiAlert(err.message); }
  }
}

// === HELPERS: rich text render + reactions + mentions ===
function renderRich(s) {
  if (!s) return '';
  // Escape first.
  let out = esc(s);
  // Code spans first to avoid double-processing inside.
  out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
  // Bold **text**
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text* (single)
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  // Strikethrough ~~text~~
  out = out.replace(/~~([^\n]+?)~~/g, '<del>$1</del>');
  // Underline __text__
  out = out.replace(/__([^_\n]+?)__/g, '<u>$1</u>');
  // Mentions @username
  out = out.replace(/(^|\s)@([a-zA-Z0-9_]+)/g, '$1<span class="ch-mention">@$2</span>');
  // Auto-link URLs.
  out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // Newlines.
  out = out.replace(/\n/g, '<br>');
  return out;
}

function renderReactionsBar(reactions) {
  const entries = Object.entries(reactions || {});
  if (!entries.length) return '';
  return '<div class="ch-msg-reactions">' +
    entries.map(([emoji, ids]) =>
      `<button class="ch-react-chip" data-emoji="${esc(emoji)}">${esc(emoji)} <span>${ids.length}</span></button>`
    ).join('') +
    '</div>';
}

function extractMentions(text) {
  const out = [];
  const re = /(^|\s)@([a-zA-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[2]);
  return [...new Set(out)];
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
function initial(s) { return (s || '?').charAt(0).toUpperCase(); }

document.addEventListener('DOMContentLoaded', () => new ChatsController());
