// Notion-lite block editor for LinkFlow notes.
// Block kinds: paragraph, h1, h2, h3, bullet, numbered, todo, code, divider, image, callout, quote.
// Slash menu opens on '/' at start of empty block.

const BLOCK_KINDS = [
  { type: 'paragraph', label: 'Text', hint: 'Plain text paragraph' },
  { type: 'h1', label: 'Heading 1', hint: 'Big heading' },
  { type: 'h2', label: 'Heading 2', hint: 'Medium heading' },
  { type: 'h3', label: 'Heading 3', hint: 'Small heading' },
  { type: 'bullet', label: 'Bulleted list', hint: '• item' },
  { type: 'numbered', label: 'Numbered list', hint: '1. item' },
  { type: 'todo', label: 'To-do', hint: '☐ task' },
  { type: 'code', label: 'Code', hint: 'Code block' },
  { type: 'quote', label: 'Quote', hint: 'Quoted text' },
  { type: 'callout', label: 'Callout', hint: 'Highlight block' },
  { type: 'divider', label: 'Divider', hint: '———' },
  { type: 'image', label: 'Image', hint: 'Upload an image' },
  { type: 'page', label: 'Sub-page', hint: 'Embed a child note' },
  { type: 'table', label: 'Table', hint: 'Editable grid' }
];

const TEMPLATES = [
  {
    name: 'Blank',
    blocks: () => [{ id: blockId(), type: 'paragraph', text: '' }]
  },
  {
    name: 'Meeting notes',
    blocks: () => [
      { id: blockId(), type: 'h1', text: 'Meeting notes' },
      { id: blockId(), type: 'h3', text: 'Attendees' },
      { id: blockId(), type: 'bullet', text: '' },
      { id: blockId(), type: 'h3', text: 'Agenda' },
      { id: blockId(), type: 'numbered', text: '' },
      { id: blockId(), type: 'h3', text: 'Action items' },
      { id: blockId(), type: 'todo', text: '', checked: false }
    ]
  },
  {
    name: 'Daily journal',
    blocks: () => [
      { id: blockId(), type: 'h1', text: new Date().toLocaleDateString() },
      { id: blockId(), type: 'h3', text: 'Wins' },
      { id: blockId(), type: 'bullet', text: '' },
      { id: blockId(), type: 'h3', text: 'Blockers' },
      { id: blockId(), type: 'bullet', text: '' },
      { id: blockId(), type: 'h3', text: 'Tomorrow' },
      { id: blockId(), type: 'todo', text: '', checked: false }
    ]
  },
  {
    name: 'Project plan',
    blocks: () => [
      { id: blockId(), type: 'h1', text: 'Project name' },
      { id: blockId(), type: 'callout', text: 'Goal: ' },
      { id: blockId(), type: 'h2', text: 'Milestones' },
      { id: blockId(), type: 'table', text: '', payload: { rows: [
        ['Milestone', 'Owner', 'Due', 'Status'],
        ['', '', '', ''],
        ['', '', '', '']
      ] } },
      { id: blockId(), type: 'h2', text: 'Notes' },
      { id: blockId(), type: 'paragraph', text: '' }
    ]
  }
];

class NotesController {
  constructor() {
    this.notes = [];
    this.current = null;
    this.saveTimer = null;
  }

  // Called by PopupController.switchView('notes')
  async open() {
    await this.loadList();
    this.bindGlobalShortcuts();
  }

  async loadList() {
    try {
      this.notes = await storage.listNotes();
    } catch (err) {
      this.notes = [];
      console.warn('Notes load failed', err);
    }
    this.renderList();
  }

  renderList() {
    const wrap = document.getElementById('notesList');
    wrap.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'notes-head';
    head.innerHTML = `<span>Notes</span>
      <span class="notes-head-actions">
        <button class="btn btn-sm btn-outline" id="notesTemplateBtn" title="From template">📄</button>
        <button class="btn btn-sm btn-primary" id="notesNewBtn">+ New</button>
      </span>`;
    wrap.appendChild(head);
    head.querySelector('#notesNewBtn').addEventListener('click', () => this.createNote());
    head.querySelector('#notesTemplateBtn').addEventListener('click', (e) => {
      this.openTemplateMenu(e.currentTarget);
    });

    if (this.notes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty';
      empty.textContent = 'No notes yet.';
      wrap.appendChild(empty);
      return;
    }

    // Build tree by parentNoteId.
    const byParent = new Map();
    for (const n of this.notes) {
      const pid = n.parentNoteId || null;
      if (!byParent.has(pid)) byParent.set(pid, []);
      byParent.get(pid).push(n);
    }
    const renderNode = (n, depth) => {
      const row = document.createElement('div');
      row.className = 'notes-row' + (this.current?.id === n.id ? ' selected' : '');
      row.style.paddingLeft = (8 + depth * 14) + 'px';
      const title = document.createElement('span');
      title.className = 'notes-row-title';
      title.textContent = (n.icon ? n.icon + ' ' : '') + (n.title || 'Untitled');
      const add = document.createElement('button');
      add.className = 'notes-row-add';
      add.title = 'New child page';
      add.textContent = '+';
      add.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.createNote(n.id);
      });
      const del = document.createElement('button');
      del.className = 'notes-row-del';
      del.title = 'Delete note (and children)';
      del.textContent = '×';
      del.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!await uiConfirm(`Delete "${n.title || 'Untitled'}" and all sub-pages?`)) return;
        await storage.deleteNote(n.id);
        if (this.current?.id === n.id) this.current = null;
        await this.loadList();
        this.renderEditor();
      });
      row.append(title, add, del);
      row.addEventListener('click', () => this.openNote(n.id));
      wrap.appendChild(row);
      const kids = byParent.get(n.id) || [];
      for (const k of kids) renderNode(k, depth + 1);
    };
    const roots = byParent.get(null) || [];
    for (const n of roots) renderNode(n, 0);
  }

  async createNote(parentNoteId = null, blocks = null) {
    const note = await storage.createNote({
      title: 'Untitled',
      parentNoteId: parentNoteId || null,
      blocks: blocks || [{ id: blockId(), type: 'paragraph', text: '' }]
    });
    this.current = note;
    await this.loadList();
    this.renderEditor();
  }

  openTemplateMenu(anchor) {
    document.querySelectorAll('.slash-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    for (const tpl of TEMPLATES) {
      const item = document.createElement('button');
      item.className = 'slash-item';
      item.innerHTML = `<strong>${tpl.name}</strong>`;
      item.addEventListener('click', async () => {
        menu.remove();
        await this.createNote(null, tpl.blocks());
      });
      menu.appendChild(item);
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${r.left}px`;
    menu.style.zIndex = '9999';
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && e.target !== anchor) {
          menu.remove();
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  async openNote(id) {
    try {
      this.current = await storage.getNote(id);
    } catch (err) {
      await uiAlert('Failed to load note: ' + (err.message || err));
      return;
    }
    this.renderList();
    this.renderEditor();
  }

  renderEditor() {
    const ed = document.getElementById('notesEditor');
    ed.innerHTML = '';
    if (!this.current) {
      const e = document.createElement('div');
      e.className = 'notes-empty';
      e.textContent = 'Select or create a note';
      ed.appendChild(e);
      return;
    }
    const note = this.current;

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'notes-toolbar';
    const pubBtn = document.createElement('button');
    pubBtn.className = 'btn btn-sm btn-outline';
    pubBtn.textContent = note.isPublic ? '🌐 Public' : '🔒 Private';
    pubBtn.addEventListener('click', () => this.togglePublic());
    toolbar.appendChild(pubBtn);
    if (note.isPublic && note.publicSlug) {
      const link = document.createElement('button');
      link.className = 'btn btn-sm btn-outline';
      link.textContent = 'Copy public link';
      link.addEventListener('click', async () => {
        const base = (typeof api !== 'undefined' && api.base) ? api.base : '';
        const url = `${base}/public/notes/${note.publicSlug}`;
        try { await navigator.clipboard.writeText(url); } catch (_) {}
      });
      toolbar.appendChild(link);
    }
    ed.appendChild(toolbar);

    // Title
    const title = document.createElement('input');
    title.className = 'notes-title';
    title.placeholder = 'Untitled';
    title.value = note.title || '';
    title.addEventListener('input', () => {
      note.title = title.value;
      this.scheduleSave();
      this.renderListInline();
    });
    ed.appendChild(title);

    // Blocks container
    const blocksWrap = document.createElement('div');
    blocksWrap.className = 'notes-blocks';
    ed.appendChild(blocksWrap);
    this.blocksWrap = blocksWrap;

    if (!Array.isArray(note.blocks) || note.blocks.length === 0) {
      note.blocks = [{ id: blockId(), type: 'paragraph', text: '' }];
    }
    for (const b of note.blocks) blocksWrap.appendChild(this.renderBlock(b));
  }

  renderListInline() {
    // Update sidebar title for current note without full re-render
    const wrap = document.getElementById('notesList');
    const rows = wrap.querySelectorAll('.notes-row');
    for (const row of rows) {
      const t = row.querySelector('.notes-row-title');
      // can't map without id; cheap path: re-render full list debounced
    }
    // simple: defer
  }

  renderBlock(b) {
    const wrap = document.createElement('div');
    wrap.className = `note-block bk-${b.type}`;
    wrap.dataset.id = b.id;

    // Hover handles: "+" (insert below) and "::" (drag + menu).
    const handles = document.createElement('div');
    handles.className = 'block-handles';
    const add = document.createElement('button');
    add.className = 'block-add';
    add.title = 'Add block below';
    add.textContent = '+';
    add.addEventListener('click', (e) => {
      e.stopPropagation();
      this.insertBlockAfter(b, { id: blockId(), type: 'paragraph', text: '' });
    });
    const grip = document.createElement('button');
    grip.className = 'block-grip';
    grip.title = 'Drag to reorder · click for menu';
    grip.draggable = true;
    grip.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
    grip.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openBlockMenu(grip, b);
    });
    grip.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/block-id', b.id);
      e.dataTransfer.effectAllowed = 'move';
      wrap.classList.add('dragging');
    });
    grip.addEventListener('dragend', () => wrap.classList.remove('dragging'));
    handles.append(add, grip);
    wrap.appendChild(handles);

    // Drop target on the block.
    wrap.addEventListener('dragover', (e) => {
      const draggedId = (e.dataTransfer.types || []).includes('text/block-id');
      if (!draggedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      wrap.classList.add('drop-target');
    });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop-target'));
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      wrap.classList.remove('drop-target');
      const sourceId = e.dataTransfer.getData('text/block-id');
      if (!sourceId || sourceId === b.id) return;
      this.moveBlock(sourceId, b.id);
    });

    const content = document.createElement('div');
    content.className = 'block-content';
    wrap.appendChild(content);

    if (b.type === 'divider') {
      const hr = document.createElement('hr');
      content.appendChild(hr);
    } else if (b.type === 'image') {
      const img = document.createElement('img');
      img.src = b.src || '';
      img.className = 'note-img';
      img.alt = '';
      const upload = document.createElement('button');
      upload.className = 'btn btn-sm btn-outline';
      upload.textContent = b.src ? 'Replace image' : 'Upload image';
      upload.addEventListener('click', () => this.uploadImage(b, img));
      content.append(img, upload);
    } else if (b.type === 'todo') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!b.checked;
      cb.addEventListener('change', () => { b.checked = cb.checked; this.scheduleSave(); });
      const ce = this.contentEditable(b);
      content.append(cb, ce);
    } else if (b.type === 'code') {
      const pre = document.createElement('pre');
      const code = this.contentEditable(b, true);
      pre.appendChild(code);
      content.appendChild(pre);
    } else if (b.type === 'page') {
      content.appendChild(this.renderPageBlock(b));
    } else if (b.type === 'table') {
      content.appendChild(this.renderTableBlock(b));
    } else {
      content.appendChild(this.contentEditable(b));
    }
    return wrap;
  }

  renderPageBlock(b) {
    const card = document.createElement('div');
    card.className = 'note-page-card';
    const targetId = b.payload?.noteId || null;
    const target = targetId ? this.notes.find(n => n.id === targetId) : null;
    const icon = document.createElement('span');
    icon.className = 'note-page-icon';
    icon.textContent = target?.icon || '📄';
    const label = document.createElement('span');
    label.className = 'note-page-label';
    label.textContent = target ? (target.title || 'Untitled') : '+ New sub-page';
    card.append(icon, label);
    card.addEventListener('click', async () => {
      if (target) {
        await this.openNote(target.id);
      } else {
        // Create child note + link
        const child = await storage.createNote({
          title: 'Untitled',
          parentNoteId: this.current.id,
          blocks: [{ id: blockId(), type: 'paragraph', text: '' }]
        });
        b.payload = { noteId: child.id };
        this.scheduleSave();
        await this.loadList();
        await this.openNote(child.id);
      }
    });
    return card;
  }

  renderTableBlock(b) {
    const wrap = document.createElement('div');
    wrap.className = 'note-table-wrap';
    const rows = (b.payload && Array.isArray(b.payload.rows)) ? b.payload.rows : [['', '']];
    const tbl = document.createElement('table');
    tbl.className = 'note-table';
    rows.forEach((row, ri) => {
      const tr = document.createElement('tr');
      row.forEach((cell, ci) => {
        const td = document.createElement(ri === 0 ? 'th' : 'td');
        td.contentEditable = 'true';
        td.spellcheck = false;
        td.textContent = cell || '';
        td.addEventListener('input', () => {
          rows[ri][ci] = td.textContent;
          b.payload = { rows };
          this.scheduleSave();
        });
        tr.appendChild(td);
      });
      tbl.appendChild(tr);
    });
    wrap.appendChild(tbl);

    const ctrls = document.createElement('div');
    ctrls.className = 'note-table-ctrls';
    const addRow = document.createElement('button');
    addRow.className = 'btn btn-sm btn-outline';
    addRow.textContent = '+ Row';
    addRow.addEventListener('click', () => {
      const cols = rows[0]?.length || 1;
      rows.push(new Array(cols).fill(''));
      b.payload = { rows };
      this.scheduleSave();
      this.renderEditor();
    });
    const addCol = document.createElement('button');
    addCol.className = 'btn btn-sm btn-outline';
    addCol.textContent = '+ Col';
    addCol.addEventListener('click', () => {
      for (const r of rows) r.push('');
      b.payload = { rows };
      this.scheduleSave();
      this.renderEditor();
    });
    const delRow = document.createElement('button');
    delRow.className = 'btn btn-sm btn-outline';
    delRow.textContent = '− Row';
    delRow.addEventListener('click', () => {
      if (rows.length <= 2) return;
      rows.pop();
      b.payload = { rows };
      this.scheduleSave();
      this.renderEditor();
    });
    const delCol = document.createElement('button');
    delCol.className = 'btn btn-sm btn-outline';
    delCol.textContent = '− Col';
    delCol.addEventListener('click', () => {
      if ((rows[0]?.length || 0) <= 1) return;
      for (const r of rows) r.pop();
      b.payload = { rows };
      this.scheduleSave();
      this.renderEditor();
    });
    ctrls.append(addRow, addCol, delRow, delCol);
    wrap.appendChild(ctrls);
    return wrap;
  }

  contentEditable(b, isCode = false) {
    const el = document.createElement(isCode ? 'code' : 'div');
    el.className = 'note-text';
    el.contentEditable = 'true';
    el.spellcheck = !isCode;
    el.textContent = b.text || '';
    const placeholder = placeholderFor(b.type);
    if (!b.text && placeholder) el.dataset.placeholder = placeholder;

    el.addEventListener('input', () => {
      b.text = el.textContent;
      this.scheduleSave();
      // remove placeholder once typing starts
      if (b.text) el.removeAttribute('data-placeholder');
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !isCode) {
        e.preventDefault();
        // Split text at caret: keep before, push after into new block.
        const sel = window.getSelection();
        let offset = el.textContent.length;
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const pre = range.cloneRange();
          pre.selectNodeContents(el);
          pre.setEnd(range.endContainer, range.endOffset);
          offset = pre.toString().length;
        }
        const full = el.textContent;
        const before = full.slice(0, offset);
        const after = full.slice(offset);
        b.text = before;
        const nb = { id: blockId(), type: 'paragraph', text: after };
        this.insertBlockAfter(b, nb);
      } else if (e.key === 'Backspace' && !el.textContent && !isCode) {
        e.preventDefault();
        this.removeBlock(b);
      } else if (e.key === '/' && !el.textContent) {
        e.preventDefault();
        this.openSlashMenu(el, b);
      }
    });
    return el;
  }

  openSlashMenu(anchor, block) {
    document.querySelectorAll('.slash-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'slash-menu';
    let filter = '';
    const renderItems = () => {
      menu.innerHTML = '';
      const matches = BLOCK_KINDS.filter(k =>
        k.label.toLowerCase().includes(filter) || k.type.includes(filter)
      );
      for (const k of matches) {
        const item = document.createElement('button');
        item.className = 'slash-item';
        item.innerHTML = `<strong>${k.label}</strong><span class="slash-hint">${k.hint}</span>`;
        item.addEventListener('click', () => {
          block.type = k.type;
          if (k.type === 'image') block.src = block.src || '';
          if (k.type === 'divider') block.text = '';
          if (k.type === 'table' && !block.payload) {
            block.payload = { rows: [
              ['Col 1', 'Col 2', 'Col 3'],
              ['', '', ''],
              ['', '', '']
            ] };
          }
          if (k.type === 'page' && !block.payload) {
            block.payload = null; // resolved on click
          }
          menu.remove();
          this.scheduleSave();
          this.renderEditor();
        });
        menu.appendChild(item);
      }
    };
    renderItems();

    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${r.left}px`;
    menu.style.zIndex = '9999';

    // Capture typed chars for filter
    const onKey = (e) => {
      if (e.key === 'Escape') { menu.remove(); cleanup(); return; }
      if (e.key === 'Backspace') {
        filter = filter.slice(0, -1);
        renderItems();
        if (!filter) { menu.remove(); cleanup(); }
        e.preventDefault();
        return;
      }
      if (e.key.length === 1) {
        filter += e.key.toLowerCase();
        renderItems();
        e.preventDefault();
      }
    };
    const onClick = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); cleanup(); }
    };
    const cleanup = () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick);
    };
    document.addEventListener('keydown', onKey, true);
    setTimeout(() => document.addEventListener('click', onClick), 0);
  }

  insertBlockAfter(prev, nb) {
    const idx = this.current.blocks.findIndex(b => b.id === prev.id);
    this.current.blocks.splice(idx + 1, 0, nb);
    this.scheduleSave();
    this.renderEditor();
    setTimeout(() => {
      const el = this.blocksWrap?.querySelector(`[data-id="${nb.id}"] .note-text`);
      el?.focus();
    }, 0);
  }

  moveBlock(sourceId, targetId) {
    const list = this.current.blocks;
    const srcIdx = list.findIndex(b => b.id === sourceId);
    const tgtIdx = list.findIndex(b => b.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0 || srcIdx === tgtIdx) return;
    const [moved] = list.splice(srcIdx, 1);
    const newTgt = list.findIndex(b => b.id === targetId);
    // Drop after target if dragging downwards, before if upwards.
    const insertAt = srcIdx < tgtIdx ? newTgt + 1 : newTgt;
    list.splice(insertAt, 0, moved);
    this.scheduleSave();
    this.renderEditor();
  }

  openBlockMenu(anchor, b) {
    document.querySelectorAll('.slash-menu, .block-menu').forEach(m => m.remove());
    const menu = document.createElement('div');
    menu.className = 'slash-menu block-menu';
    const items = [
      { label: 'Turn into', sub: BLOCK_KINDS.map(k => ({
        label: k.label,
        run: () => {
          b.type = k.type;
          if (k.type === 'table' && !b.payload) {
            b.payload = { rows: [['Col 1', 'Col 2', 'Col 3'], ['', '', ''], ['', '', '']] };
          }
          this.scheduleSave();
          this.renderEditor();
        }
      })) },
      { label: 'Duplicate', run: () => {
        const copy = JSON.parse(JSON.stringify(b));
        copy.id = blockId();
        this.insertBlockAfter(b, copy);
      }},
      { label: 'Move up', run: () => {
        const idx = this.current.blocks.findIndex(x => x.id === b.id);
        if (idx > 0) {
          const tmp = this.current.blocks[idx - 1];
          this.current.blocks[idx - 1] = b;
          this.current.blocks[idx] = tmp;
          this.scheduleSave();
          this.renderEditor();
        }
      }},
      { label: 'Move down', run: () => {
        const idx = this.current.blocks.findIndex(x => x.id === b.id);
        if (idx >= 0 && idx < this.current.blocks.length - 1) {
          const tmp = this.current.blocks[idx + 1];
          this.current.blocks[idx + 1] = b;
          this.current.blocks[idx] = tmp;
          this.scheduleSave();
          this.renderEditor();
        }
      }},
      { label: 'Delete', danger: true, run: () => this.removeBlock(b) }
    ];
    for (const it of items) {
      const btn = document.createElement('button');
      btn.className = 'slash-item' + (it.danger ? ' danger' : '');
      btn.innerHTML = `<strong>${it.label}</strong>${it.sub ? '<span class="slash-hint">▸</span>' : ''}`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (it.sub) {
          this.openSubMenu(btn, it.sub);
        } else {
          menu.remove();
          it.run();
        }
      });
      menu.appendChild(btn);
    }
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${r.bottom + 4}px`;
    menu.style.left = `${r.left}px`;
    menu.style.zIndex = '9999';
    setTimeout(() => {
      const close = (e) => {
        if (!menu.contains(e.target) && !e.target.closest('.block-submenu')) {
          menu.remove();
          document.querySelectorAll('.block-submenu').forEach(m => m.remove());
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    }, 0);
  }

  openSubMenu(anchor, items) {
    document.querySelectorAll('.block-submenu').forEach(m => m.remove());
    const sub = document.createElement('div');
    sub.className = 'slash-menu block-submenu';
    for (const it of items) {
      const btn = document.createElement('button');
      btn.className = 'slash-item';
      btn.innerHTML = `<strong>${it.label}</strong>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sub.remove();
        document.querySelectorAll('.block-menu').forEach(m => m.remove());
        it.run();
      });
      sub.appendChild(btn);
    }
    document.body.appendChild(sub);
    const r = anchor.getBoundingClientRect();
    sub.style.position = 'fixed';
    sub.style.top = `${r.top}px`;
    sub.style.left = `${r.right + 4}px`;
    sub.style.zIndex = '10000';
  }

  removeBlock(b) {
    const idx = this.current.blocks.findIndex(x => x.id === b.id);
    if (idx < 0) return;
    if (this.current.blocks.length === 1) return;
    this.current.blocks.splice(idx, 1);
    this.scheduleSave();
    this.renderEditor();
    setTimeout(() => {
      const prev = this.current.blocks[Math.max(0, idx - 1)];
      const el = prev && this.blocksWrap?.querySelector(`[data-id="${prev.id}"] .note-text`);
      el?.focus();
      placeCaretAtEnd(el);
    }, 0);
  }

  scheduleSave() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 600);
  }

  async flushSave() {
    if (!this.current) return;
    try {
      const updated = await storage.updateNote(this.current.id, {
        title: this.current.title || 'Untitled',
        blocks: this.current.blocks
      });
      this.current = updated;
      // keep sidebar list title in sync
      const idx = this.notes.findIndex(n => n.id === updated.id);
      if (idx >= 0) this.notes[idx] = updated;
      this.renderList();
    } catch (err) {
      console.warn('Note save failed', err);
    }
  }

  async togglePublic() {
    if (!this.current) return;
    const next = !this.current.isPublic;
    const updated = await storage.updateNote(this.current.id, { isPublic: next });
    this.current = updated;
    this.renderEditor();
  }

  async uploadImage(block, imgEl) {
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
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`, {
          method: 'POST', body: fd
        });
        const data = await res.json();
        if (!data.secure_url) throw new Error(data.error?.message || 'upload failed');
        block.src = data.secure_url;
        imgEl.src = data.secure_url;
        this.scheduleSave();
      } catch (err) {
        await uiAlert('Upload failed: ' + (err.message || err));
      }
    };
    input.click();
  }

  bindGlobalShortcuts() { /* placeholder */ }
}

function blockId() {
  return 'b-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function placeholderFor(type) {
  switch (type) {
    case 'h1': return 'Heading 1';
    case 'h2': return 'Heading 2';
    case 'h3': return 'Heading 3';
    case 'bullet': return '• List item';
    case 'numbered': return '1. List item';
    case 'todo': return 'To-do';
    case 'code': return 'Code';
    case 'quote': return 'Quote';
    case 'callout': return 'Callout';
    default: return 'Type "/" for commands…';
  }
}

function placeCaretAtEnd(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

window.notesController = new NotesController();
