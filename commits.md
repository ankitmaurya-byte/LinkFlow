# Engineering Contributions — Last 12 Months (2025-05-01 → 2026-05-01)

Repo: `bookmark` (urlgram — browser-extension bookmark manager + Express/Mongo backend)
Stack: Node.js 20 · Express 4 · Mongoose 8 · MongoDB · JWT · bcrypt · Vitest · Manifest V3 (Firefox/Chrome) · vanilla JS frontend · Vercel serverless

> Solo project — both author identities (`alsoarpit16@gmail.com`, `ankitmaurya2989@gmail.com`) are the same person (Ankit). Part 2 therefore groups related commits into shipped features rather than highlighting a separate team.

---

## Part 1 — My Contributions (Ankit)

### 1. Two-way browser-bookmark sync (urlgram ↔ browser toolbar)
**Commit:** `21430fa` · Date: 2026-05-01
**File(s):** `frontend/lib/bookmarks-sync.js` (+184/-167), `frontend/popup/popup.js` (+16), `frontend/background.js`, `frontend/manifest.json`, `frontend/popup/popup.html`

**What I built**
Replaced the previous one-way mirror with a manual two-way merge between the urlgram server and the browser's bookmarks toolbar. urlgram → browser pushes folder/link creates and title/URL updates; browser → urlgram only adds new entries (browser-side edits are not pushed back). No deletes either way ("no loss" guarantee), and the run is idempotent so re-clicking Sync is a no-op. Added a robust toolbar resolver that tries well-known IDs (`toolbar_____`/`1`), then locale title match, then first-folder fallback, plus reverse maps to skip already-imported nodes.

**Resume bullet**
> Built bidirectional, idempotent sync between a custom bookmark service and the native browser bookmarks API with cross-vendor toolbar resolution and additive-only conflict policy.

**Key code**
```js
async getToolbarRoot() {
  for (const id of ['toolbar_____', '1']) {
    try { await browser.bookmarks.get(id); return id; } catch (_) {}
  }
  const tree = await browser.bookmarks.getTree();
  const tops = tree[0]?.children || [];
  const byTitle = tops.find(n => !n.url && /toolbar|bookmarks bar/i.test(n.title || ''));
  if (byTitle) return byTitle.id;
  const firstFolder = tops.find(n => !n.url);
  return firstFolder ? firstFolder.id : null;
}

async pullBrowser(browserParentId, lfParentId, map) {
  const children = await browser.bookmarks.getChildren(browserParentId);
  for (const ch of children) {
    if (ch.url) {
      if (map.reverseLinks[ch.id]) continue;
      const data = await api.authedFetch('/bookmarks', {
        method: 'POST',
        body: { tab: 'root', parentId: lfParentId, kind: 'link',
                name: (ch.title && ch.title.trim()) || ch.url, url: ch.url }
      });
      const newId = data?.bookmark?.id;
      if (newId) { map.links[newId] = ch.id; map.reverseLinks[ch.id] = newId; }
    }
    /* folder branch elided */
  }
}
```

---

### 2. Removed legacy one-way sync + onChange listener
**Commit:** `f1f5ec0` · Date: 2026-04-30
**File(s):** `frontend/background.js` (-43), `frontend/lib/bookmarks-sync.js` (-239), `frontend/manifest.json`

**What I built**
Deleted the old `BookmarkSync` listener that auto-mirrored every storage change into a "urlgram" subfolder under "Other Bookmarks". Pulled the script tag from `manifest.json` and the wiring from `background.js`. This unblocked the manual two-way merge that landed the next day by removing the auto-runner that would have fought the new flow.

**Resume bullet**
> Decommissioned an auto-firing one-way sync subsystem to make room for a manual bidirectional merge model.

**Key code**
```diff
-import { BookmarkSync } from './lib/bookmarks-sync.js';
-const sync = new BookmarkSync();
-browser.runtime.onInstalled.addListener(() => sync.init());
-browser.runtime.onStartup.addListener(() => sync.init());
-browser.storage.onChanged.addListener((changes, area) => {
-  if (area === 'local') sync.schedule();
-});
```

---

### 3. Hover-to-drill folder navigation in popup tree
**Commit:** `f8c8ccb` · Date: 2026-04-30
**File(s):** `frontend/popup/popup.js` (+11)

**What I built**
Added a 180 ms hover delay on folder rows that auto-selects them, opening the next column without a click. Cleaned up on `mouseleave` to avoid stale timers and only attaches when the row is a folder, unselected, and has a click handler.

**Resume bullet**
> Added hover-intent navigation to a column-based folder explorer with debounce cleanup to avoid accidental drilling.

**Key code**
```js
if (isFolder && !selected && onClick) {
  let hoverTimer = null;
  row.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => onClick(), 180);
  });
  row.addEventListener('mouseleave', () => {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  });
}
```

---

### 4. Auto-extend column path + hover-open context menu
**Commit:** `2daaed3` · Date: 2026-04-29
**File(s):** `frontend/popup/popup.js` (+41/-8), `frontend/popup/popup.css`, `frontend/content/floating.js`

**What I built**
Loosened `ensureAutoExpand` from "only one folder" to "any folders present", so the explorer drills into the first child by default. Made the row-level `more-vert` menu open on hover with a deferred-close timer and toggle-on-click semantics, and added matching CSS for the floating bubble panel.

**Resume bullet**
> Reworked column-drill heuristics and converted a click-only menu into a hover-friendly menu with safe close debouncing.

**Key code**
```js
async ensureAutoExpand() {
  let safety = 0;
  while (safety++ < 32 && this.path.length > 0) {
    const last = this.path[this.path.length - 1];
    const folders = (await storage.getFolders(last.tabId))
      .filter(f => f.parentId === last.folderId);
    if (folders.length >= 1) {
      this.path.push({ tabId: last.tabId, folderId: folders[0].id });
    } else break;
  }
}
```

---

### 5. URL-share + DM-on-share + chat plumbing across extension and backend
**Commit:** `5545540` · Date: 2026-04-29
**File(s):** 16 files, +560/-169 (highlights: `backend/src/routes/share.js` +69, `frontend/lib/dialog.js` +79, `frontend/popup/popup.js` +211, `frontend/popup/popup.css` +97)

**What I built**
Extended the `/share` endpoint to accept `userIds` (DMs) in addition to `groupIds`. For each user target, validated friendship status, then found-or-created a 2-person DM `Group` named `DM @me ↔ @other` with both as members and the requester as admin, before broadcasting the chat message. Added a reusable `dialog.js` modal helper, restyled the popup share UI, and wired share/chat actions in the popup.

**Resume bullet**
> Designed a unified share API that targets groups or auto-provisioned DM groups, gated by friendship state, with idempotent DM-group reuse.

**Key code**
```js
async function ensureDMGroup(meId, otherUserId) {
  const myGroups = await GroupMember.find({ userId: meId }).select('groupId');
  const ids = myGroups.map(m => m.groupId);
  if (ids.length) {
    const otherInSame = await GroupMember.find({
      groupId: { $in: ids }, userId: otherUserId
    }).select('groupId');
    for (const m of otherInSame) {
      const count = await GroupMember.countDocuments({ groupId: m.groupId });
      if (count === 2) return m.groupId.toString();
    }
  }
  const other = await User.findById(otherUserId).select('username');
  const me = await User.findById(meId).select('username');
  const g = await Group.create({
    name: `DM @${me.username} ↔ @${other.username}`,
    adminId: meId, inviteCode: makeInviteCode()
  });
  await GroupMember.insertMany([
    { groupId: g._id, userId: meId, role: 'admin' },
    { groupId: g._id, userId: otherUserId, role: 'member' }
  ]);
  return g._id.toString();
}
```

---

### 6. Polished popup UI: monochrome icon set, inline rename, settings flyout
**Commit:** `84235c0` · Date: 2026-04-29
**File(s):** 12 files, +336/-72 (highlights: `frontend/lib/icons.js` +48 new, `frontend/popup/popup.js` +180, `frontend/popup/popup.html`)

**What I built**
Replaced emoji icons across the popup, dashboard, and playground with a 19-icon monochrome SVG set (`feather`-style, currentColor stroke) loaded from a single `icons.js` registry and rehydrated through `[data-icon]` attributes. Restructured the settings dropdown into a proper aria-expanded flyout, inlined rename inputs in the tree, and trimmed legacy emoji-based labels.

**Resume bullet**
> Shipped a unified currentColor SVG icon system across three extension surfaces, replacing inconsistent emoji and improving theming.

**Key code**
```js
const SVG_ATTR = 'width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICONS = {
  save: `<svg ${SVG_ATTR}><path d="M19 21H5a2 2 0 01-2-2V5..."/>...</svg>`,
  link: `<svg ${SVG_ATTR}><path d="M10 13a5 5 0 007.54.54..."/>...</svg>`,
  'folder-plus': `<svg ${SVG_ATTR}>...</svg>`,
  /* + 16 more */
};
function iconSvg(name) { return ICONS[name] || ''; }
```

---

### 7. Floating in-page bubble redesign + viewport-fit panel
**Commit:** `b857b57` · Date: 2026-04-29
**File(s):** `frontend/content/floating.js` (+30/-32)

**What I built**
Resized the on-page floating launcher from 48×48 px to 100×79 px and switched the panel from absolute-relative anchoring to fixed viewport positioning so it doesn't shift the bubble when fitting on screen. Adjusted the `clampToViewport` math for the new bubble dimensions.

**Resume bullet**
> Redesigned an in-page floating launcher and decoupled panel placement from bubble position to stop layout-thrash on viewport-fit recompute.

**Key code**
```js
const BUBBLE_W = 100;
const BUBBLE_H = 79;
function clampToViewport(x, y) {
  const vw = window.innerWidth, vh = window.innerHeight;
  return {
    x: Math.max(0, Math.min(x, vw - BUBBLE_W)),
    y: Math.max(0, Math.min(y, vh - BUBBLE_H))
  };
}
```

---

### 8. Design-system DESIGN.md + Airtable-inspired theming pass
**Commit:** `61505aa` · Date: 2026-04-29
**File(s):** `DESIGN.md` +554 (new), `frontend/popup/popup.css` +112/-79, `frontend/dashboard/dashboard.css` +44/-40, `frontend/playground/playground.css` +47/-43, plus icon refresh

**What I built**
Authored `DESIGN.md`, a YAML-front-matter design spec defining the urlgram palette (`signature-coral`, `signature-forest`, etc.), Haas Grotesk type scale, hairline `#dddddd` borders, and pill-CTA primaries. Re-themed popup, dashboard, and playground CSS to match, and replaced raster icons with smaller versions.

**Resume bullet**
> Authored a versioned design spec (palette, typography, button system) and rolled it across three frontend surfaces in a single coherent pass.

**Key code**
```yaml
colors:
  primary: "#181d26"
  ink: "#181d26"
  hairline: "#dddddd"
  surface-soft: "#f8fafc"
  signature-coral: "#aa2d00"
  signature-forest: "#0a2e0e"
  signature-peach: "#fcab79"
  on-primary: "#ffffff"
  link: "#1b61c9"
typography:
  display-xl: { fontFamily: "Haas Groot Disp, Haas, sans-serif" }
```

---

### 9. Floating-icon drag fix: viewport-coord panel placement with priority candidates
**Commit:** `8657f66` · Date: 2026-04-28
**File(s):** `frontend/content/floating.js` (+59/-71)

**What I built**
Replaced the side-anchored `data-side` panel system with explicit viewport candidate placement: panel is `position: fixed`, and `positionPanel()` walks six candidate offsets (right/left/below/above/right-bottom/left-bottom) relative to the bubble in priority order, picking the first that fits. Removed `savedDisplayPos` since the bubble no longer moves on panel-fit.

**Resume bullet**
> Fixed a drag-and-reposition bug in a content-script overlay by switching panel placement to a priority-ordered viewport-fit algorithm.

**Key code**
```js
function positionPanel() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const bx = currentPos.x, by = currentPos.y;
  const pw = Math.min(PANEL_W, vw - 16);
  const ph = Math.min(PANEL_H, vh - 16);
  const candidates = [
    { x: bx + BUBBLE + GAP,           y: by },
    { x: bx - GAP - pw,               y: by },
    { x: bx,                          y: by + BUBBLE + GAP },
    { x: bx,                          y: by - GAP - ph },
    { x: bx + BUBBLE + GAP,           y: by + BUBBLE - ph },
    { x: bx - GAP - pw,               y: by + BUBBLE - ph },
  ];
  /* pick first that fits within viewport */
}
```

---

### 10. Frontend ↔ backend integration: friends, groups, chat, todo persistence
**Commit:** `452e50a` · Date: 2026-04-28
**File(s):** 21 files, +1280/-618 (highlights: `frontend/playground/playground.js` +373, `frontend/lib/storage.js` +156/-166, `backend/src/models/todoData.js` +8 new, `backend/src/routes/todos.js` +31 new, `backend/src/routes/share.js`, `frontend/content/floating.js` +146)

**What I built**
Added per-user `TodoData` Mongoose model (single mixed-document with `projects/statuses/tasks`) and `GET/PUT /todos` endpoints with upsert, plus chat/share enhancements. Rewrote the Playground controller into a four-view shell (`friends/groups/chat/share`) backed by the new endpoints, replaced the local-only storage layer with API-backed reads, and added a `README.md`.

**Resume bullet**
> Wired a vanilla-JS extension to the Express/Mongo backend across friends, groups, chat, share, and todo features, replacing local-only storage with authenticated API calls.

**Key code**
```js
// backend/src/routes/todos.js
router.put('/', async (req, res, next) => {
  try {
    const data = req.body && req.body.data;
    if (!data || typeof data !== 'object') {
      throw new AppError('VALIDATION', 'data object required', 400);
    }
    const doc = await TodoData.findOneAndUpdate(
      { ownerId: req.user.id },
      { $set: { data } },
      { upsert: true, new: true }
    );
    res.json({ data: doc.data });
  } catch (e) { next(e); }
});
```

---

### 11. Local Todo board (projects / statuses / tasks) in popup
**Commit:** `e76dfe8` · Date: 2026-04-28
**File(s):** `frontend/popup/popup.js` +329, `frontend/popup/popup.css` +287/-26, `frontend/lib/storage.js` +103, `frontend/popup/popup.html` +27/-41, `frontend/content/floating.js` +182

**What I built**
Added a Todo view to the popup (Linear-style board with custom statuses per project), plus a `StorageManager` API for `getTodoData/createTodoProject/renameTodoStatus/addTodoTask/...` over `browser.storage.local`. Statuses default to `Todo / In Progress / Done`. Wired the sidebar `[data-view="todo"]` button and added the floating-icon panel.

**Resume bullet**
> Added a per-project Kanban-style todo manager to a browser extension, including persistence, inline rename, and dynamic status columns.

**Key code**
```js
async createTodoProject(name) {
  const data = await this.getTodoData();
  const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  data.projects.push({ id, name, createdAt: new Date().toISOString() });
  data.statuses[id] = [
    { id: `st-${id}-todo`, name: 'Todo', order: 0 },
    { id: `st-${id}-prog`, name: 'In Progress', order: 1 },
    { id: `st-${id}-done`, name: 'Done', order: 2 }
  ];
  data.tasks[id] = [];
  await this.setTodoData(data);
  return id;
}
```

---

### 12. Backend Vercel build hooks (.vercelignore, build script)
**Commit:** `ef73fec` · Date: 2026-04-28
**File(s):** `backend/.gitignore` +1, `backend/package.json` +1

**What I built**
Added `.vercel` to `.gitignore` and a no-op `build` npm script so Vercel CLI's project-detection step succeeds on a no-build Node service.

**Resume bullet**
> Configured Node.js backend for Vercel serverless deployment with a no-op build pipeline and ignore rules.

**Key code**
```diff
   "scripts": {
     "dev": "node --watch src/server.js",
     "start": "node src/server.js",
+    "build": "echo \"no build step\"",
     "test": "vitest run",
```

---

### 13. Vercel serverless adapter + CORS middleware + reference snippet docs
**Commit:** `58cf46e` · Date: 2026-04-28
**File(s):** `backend/api/index.js` +22 (new), `backend/vercel.json` +6 (new), `backend/src/middleware/cors.js` +36 (new), `backend/.vercelignore` +6, `docs/javascript-snippets.md` +178, `docs/typescript-snippets.md` +202, `frontend/popup/popup.css` +72/-41, `frontend/popup/popup.js` +53

**What I built**
Wrote a Vercel handler that lazily caches one `createApp()` instance per cold container and connects Mongoose only when `readyState === 0`, plus a `vercel.json` rewriting all paths to `/api/index`. Added CORS middleware and dropped two reference files (JS/TS snippets) into `docs/`.

**Resume bullet**
> Adapted an Express app for Vercel serverless with cold-start-friendly app/connection caching and a single rewrite to a `/api/index` handler.

**Key code**
```js
let appPromise = null;
async function getApp() {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    validateConfig();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUrl);
    }
    return createApp();
  })();
  return appPromise;
}
export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
```

---

### 14. Horizontal column-drill explorer (Miller-columns)
**Commit:** `10da251` · Date: 2026-04-27
**File(s):** `frontend/popup/popup.js` +273/-242, `frontend/popup/popup.css` +247/-144, `frontend/popup/popup.html` +19/-112

**What I built**
Replaced the breadcrumb + single-folder view with a Miller-columns explorer (`expanded` set + `path` array). Each column lists folders in one tab/parent; selecting a folder pushes the next column. Removed the `Breadcrumbs` component and reduced popup HTML by ~80 lines.

**Resume bullet**
> Reimplemented a bookmark explorer as horizontal Miller-columns with state-tracked path arrays, replacing breadcrumb-driven navigation.

**Key code**
```js
toggleExpand(key) {
  if (this.expanded.has(key)) this.expanded.delete(key);
  else this.expanded.add(key);
}
async loadCurrentView() {
  const view = await storage.getCurrentView();
  this.currentTab = (view.tabId && view.tabId !== 'all-links') ? view.tabId : 'work';
  this.currentFolder = view.folderId || null;
  this.expanded.add(`tab:${this.currentTab}`);
  this.path = [{ tabId: this.currentTab, folderId: null }];
}
```

---

### 15. Initial extension drop: dashboard, popup, login, Netscape import, one-way sync
**Commit:** `cc4183c` · Date: 2026-04-27
**File(s):** 34 files, +6378/-2 (new modules: `dashboard.{html,css,js}`, `popup.{html,css,js}`, `bookmarks.html`, `components/{breadcrumbs,folder-card,link-card,login-form,modal}.js`, `lib/{api,auth,bookmarks-import,bookmarks-sync,storage}.js`, `background.js`, manifest, icons; backend: `middleware/cors.js`, rate-limit tweak)

**What I built**
Bootstrapped the entire frontend extension: Manifest V3 with `bookmarks/storage/tabs/alarms/unlimitedStorage` permissions, login form (`AuthManager` with token + refresh), API wrapper, bookmarks importer that parses Netscape `<DL><DT>` HTML and unwraps system folder names ("Bookmarks Toolbar", "Other Bookmarks", etc.), URL normalizer, and a one-way `BookmarkSync` mirror into a "urlgram" subfolder. Added dashboard and popup with components for breadcrumbs / folder-card / link-card / modal.

**Resume bullet**
> Bootstrapped a Manifest V3 browser extension (popup, dashboard, content overlay) with auth, REST client, Netscape bookmarks importer, and one-way browser-bookmark mirroring.

**Key code**
```js
// frontend/lib/bookmarks-import.js
parseDL(dl) {
  const items = [];
  for (const dt of dl.children) {
    if (dt.tagName !== 'DT') continue;
    const header = dt.querySelector(':scope > h3');
    const anchor = dt.querySelector(':scope > a');
    if (header) {
      const nestedDL = dt.querySelector(':scope > dl');
      items.push({
        type: 'folder',
        name: header.textContent.trim() || 'Untitled Folder',
        isSystem: header.hasAttribute('personal_toolbar_folder')
               || header.hasAttribute('unfiled_bookmarks_folder'),
        children: nestedDL ? this.parseDL(nestedDL) : []
      });
    } else if (anchor && anchor.href) {
      items.push({ type: 'link', title: anchor.textContent.trim() || anchor.href, url: anchor.href });
    }
  }
  return items;
}
```

---

### 16. Documentation polish: rate-limit env, deferred-cycle note, kick-route ObjectId guard
**Commit:** `66bce49` · Date: 2026-04-25
**File(s):** `backend/.env.example` +3, `backend/src/models/group.js` +5, `backend/src/routes/groups.js` +3

**What I built**
Documented `PER_IP_AUTH_RATE` in `.env.example` (Spec §10 wants 10/min in prod; default 100 stays dev-friendly). Added a comment on `Group` recording that cycle-prevention on `parentGroupId` is deferred until a reparent endpoint exists. Added `mongoose.isValidObjectId` guard to the kick endpoint so a junk `:userId` returns 404 not 500.

**Resume bullet**
> Hardened group-admin endpoints with input validation and documented deferred design decisions in code and env templates.

**Key code**
```js
router.delete('/:id/members/:userId', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) {
      throw new AppError('NOT_FOUND', 'Member not found', 404);
    }
    /* ... */
  }
});
```

---

### 17. Chat: per-group URL share + paginated history
**Commit:** `40f97bd` · Date: 2026-04-25
**File(s):** `backend/src/routes/chat.js` +52 (new), `backend/src/models/chatMessage.js` +14, `backend/src/app.js` +2, `backend/tests/chat.test.js` +63

**What I built**
Mounted `/groups/:id/chat` (mergeParams) gated by `requireGroupMember`. `POST` writes a `ChatMessage{kind:'url', url, title, platform}`; `GET` returns up to `min(limit, 100)` messages, supports `?before=<ISO>` cursor for backfill, sorted by `createdAt` desc.

**Resume bullet**
> Implemented per-group chat with URL-card messages and cursor-based history pagination, gated by group membership.

**Key code**
```js
router.get('/', requireGroupMember('id'), async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const filter = { groupId: req.params.id };
    if (req.query.before) {
      const d = new Date(req.query.before);
      if (Number.isNaN(d.valueOf())) throw new AppError('VALIDATION', 'invalid before', 400);
      filter.createdAt = { $lt: d };
    }
    const list = await ChatMessage.find(filter).sort({ createdAt: -1 }).limit(limit);
    res.json({ messages: list.map(publicMsg) });
  } catch (e) { next(e); }
});
```

---

### 18. Group folders: member-read, admin-write/delete with subtree cascade
**Commit:** `5bc1fd2` · Date: 2026-04-25
**File(s):** `backend/src/models/groupFolder.js` +9 (new), `backend/src/routes/groups.js` +59, `backend/tests/groupFolders.test.js` +66

**What I built**
Added `GroupFolder` (groupId + parentFolderId + name) and three endpoints: `GET /:id/folders?parentFolderId=` (any member), `POST /:id/folders` (admin), and `DELETE /:id/folders/:fid` (admin) which BFS-walks the parent chain to delete the entire subtree in one `deleteMany`.

**Resume bullet**
> Added a tree-structured group folder API with breadth-first cascade delete and role-segmented read/write authorization.

**Key code**
```js
router.delete('/:id/folders/:fid', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const root = await GroupFolder.findOne({ _id: req.params.fid, groupId: req.params.id });
    if (!root) throw new AppError('NOT_FOUND', 'Not found', 404);
    const toDelete = [root._id];
    let frontier = [root._id];
    while (frontier.length) {
      const children = await GroupFolder.find(
        { parentFolderId: { $in: frontier }, groupId: req.params.id }, { _id: 1 });
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id);
    }
    await GroupFolder.deleteMany({ _id: { $in: toDelete }, groupId: req.params.id });
    res.status(204).end();
  } catch (e) { next(e); }
});
```

---

### 19. Group join requests + members + admin kick
**Commit:** `58e8fd5` · Date: 2026-04-25
**File(s):** `backend/src/routes/groups.js` +91, `backend/tests/groups.test.js` +61

**What I built**
Added `POST /:id/join` (creates pending `JoinRequest`, rejects duplicates and existing members), `GET /:id/requests` (admin-only, joins with usernames), `POST /:id/requests/:reqId/approve` (upserts membership atomically with `$setOnInsert`), `DELETE /:id/requests/:reqId`, and `GET /:id/members`.

**Resume bullet**
> Built a group join-request workflow with admin approval/rejection, idempotent membership upsert, and conflict detection on duplicate requests.

**Key code**
```js
router.post('/:id/requests/:reqId/approve', requireGroupAdmin('id'), async (req, res, next) => {
  try {
    const jr = await JoinRequest.findOne({
      _id: req.params.reqId, groupId: req.params.id, status: 'pending'
    });
    if (!jr) throw new AppError('NOT_FOUND', 'Not found', 404);
    jr.status = 'approved';
    await jr.save();
    await GroupMember.updateOne(
      { groupId: jr.groupId, userId: jr.userId },
      { $setOnInsert: { groupId: jr.groupId, userId: jr.userId, role: 'member' } },
      { upsert: true }
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});
```

---

### 20. Groups: create with creator-as-admin + subgroup parent membership
**Commit:** `4a03b20` · Date: 2026-04-25
**File(s):** `backend/src/routes/groups.js` +69 (new), `backend/src/app.js` +2, `backend/tests/groups.test.js` +58

**What I built**
`POST /groups` validates name, optionally checks parentGroupId membership, creates the `Group`, and inserts a `GroupMember` with `role:'admin'` for the creator. `GET /groups` lists my groups. `GET /:id` and `GET /:id/children` read individual + subgroup trees, both gated by `requireGroupMember`.

**Resume bullet**
> Built group + subgroup creation with parent-membership enforcement and automatic admin assignment for the creator.

**Key code**
```js
router.post('/', async (req, res, next) => {
  try {
    const { name, parentGroupId } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) throw new AppError('VALIDATION', 'name required', 400);
    let parent = null;
    if (parentGroupId) {
      if (!mongoose.isValidObjectId(parentGroupId)) throw new AppError('VALIDATION', 'invalid parentGroupId', 400);
      parent = await Group.findById(parentGroupId);
      if (!parent) throw new AppError('VALIDATION', 'parent group not found', 400);
      const m = await GroupMember.findOne({ groupId: parent._id, userId: req.user.id });
      if (!m) throw new AppError('FORBIDDEN', 'Not a member of parent group', 403);
    }
    const created = await Group.create({
      name: name.trim(),
      parentGroupId: parent ? parent._id : null,
      adminId: req.user.id
    });
    await GroupMember.create({ groupId: created._id, userId: req.user.id, role: 'admin' });
    res.json({ group: publicGroup(created) });
  } catch (e) { next(e); }
});
```

---

### 21. Group + JoinRequest models
**Commit:** `8dc2b0e` · Date: 2026-04-25
**File(s):** `backend/src/models/group.js` +9 (new), `backend/src/models/joinRequest.js` +11 (new)

**What I built**
`Group{parentGroupId?, name, adminId}` for the tree-structured group hierarchy; `JoinRequest{groupId, userId, status:'pending'|'approved'|'rejected'}` with a compound `(groupId, userId, status)` index for fast pending-request lookups.

**Resume bullet**
> Modeled hierarchical groups and an approval-state join-request entity with compound indexing for membership-state queries.

**Key code**
```js
// joinRequest.js
const schema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
  userId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true, index: true },
  status:  { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' }
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ groupId: 1, userId: 1, status: 1 });
```

---

### 22. Cross-cutting auth guards: requireFriendOf + requireGroupMember + requireGroupAdmin
**Commit:** `7dbfcf3` · Date: 2026-04-25
**File(s):** `backend/src/middleware/auth.js` +50, `backend/src/models/groupMember.js` +11 (new), `backend/src/routes/friends.js` +22, `backend/src/app.js` +3, `backend/tests/friends.test.js` +19

**What I built**
Three reusable middleware factories: `requireFriendOf(param)` checks accepted Friendship between requester and `:username`, `requireGroupMember(param)` and `requireGroupAdmin(param)` check `GroupMember` by `groupId` + role. Each rejects with the correct status (403 vs 404) and attaches the resolved record to `req` for downstream handlers.

**Resume bullet**
> Built three composable Express auth-middleware factories (friend, group-member, group-admin) that resolve and attach domain entities for downstream handlers.

**Key code**
```js
export function requireGroupMember(paramName = 'id') {
  return async (req, _res, next) => {
    try {
      const groupId = req.params[paramName];
      if (!mongoose.isValidObjectId(groupId)) return next(new AppError('NOT_FOUND', 'Not found', 404));
      const m = await GroupMember.findOne({ groupId, userId: req.user.id });
      if (!m) return next(new AppError('FORBIDDEN', 'Not a member', 403));
      req.groupMember = m;
      next();
    } catch (e) { next(e); }
  };
}
```

---

### 23. Friends DELETE (reject pending + unfriend accepted)
**Commit:** `16fcb93` · Date: 2026-04-25
**File(s):** `backend/src/routes/friends.js` +12, `backend/tests/friends.test.js` +28

**What I built**
`DELETE /friends/:id` deletes the Friendship row whether it's pending (= reject) or accepted (= unfriend). Returns 404 if the requester is neither side.

**Resume bullet**
> Added an idempotent friendship-delete endpoint covering both reject-request and unfriend semantics with 404 on non-participants.

**Key code**
```js
router.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('NOT_FOUND', 'Not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const f = await Friendship.findById(req.params.id);
    if (!f) throw new AppError('NOT_FOUND', 'Not found', 404);
    if (!(f.userA.equals(me) || f.userB.equals(me))) throw new AppError('NOT_FOUND', 'Not found', 404);
    await f.deleteOne();
    res.status(204).end();
  } catch (e) { next(e); }
});
```

---

### 24. Friend request, accept, list, requests-inbox endpoints
**Commit:** `4607837` · Date: 2026-04-25
**File(s):** `backend/src/routes/friends.js` +83 (new), `backend/src/app.js` +2, `backend/tests/friends.test.js` +72

**What I built**
`POST /friends/request` looks up the target by username, normalizes the `(userA, userB)` pair, rejects self-friending and duplicates with 409. `GET /friends/requests` splits pending Friendships into `{incoming, outgoing}` based on `requesterId`. `POST /:id/accept` flips status to `accepted` (only the addressee can). `GET /friends/` returns accepted-friend usernames.

**Resume bullet**
> Implemented full friend-request lifecycle (request/accept/list/inbox) with normalized pair storage, conflict detection, and role-correct accept authorization.

**Key code**
```js
router.post('/request', async (req, res, next) => {
  try {
    const { username } = req.body || {};
    if (typeof username !== 'string' || !username.trim()) {
      throw new AppError('VALIDATION', 'username required', 400);
    }
    if (username.toLowerCase() === req.user.username) {
      throw new AppError('VALIDATION', 'cannot friend yourself', 400);
    }
    const target = await User.findOne({ username: username.toLowerCase() });
    if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);
    const me = new mongoose.Types.ObjectId(req.user.id);
    const pair = Friendship.normalizePair(me, target._id);
    const exists = await Friendship.findOne(pair);
    if (exists) throw new AppError('CONFLICT', 'Friendship already exists', 409);
    const created = await Friendship.create({ ...pair, requesterId: me, status: 'pending' });
    res.json({ friendship: publicFriendship(created) });
  } catch (e) { next(e); }
});
```

---

### 25. Friendship model with normalized-pair unique index
**Commit:** `adbf0ea` · Date: 2026-04-25
**File(s):** `backend/src/models/friendship.js` +20 (new)

**What I built**
Stored each friendship once by sorting the two ObjectIds — `userA = lower hex string, userB = higher` — with a unique compound index on `(userA, userB)`. The `normalizePair(a,b)` static does the sort. `requesterId` records the initiator so accept/reject roles work without ambiguity.

**Resume bullet**
> Designed a friendship schema with deterministic-pair indexing to enforce single-row representation and prevent duplicate-direction races.

**Key code**
```js
const schema = new mongoose.Schema({
  userA: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  userB: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requesterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'accepted'], required: true, default: 'pending' }
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ userA: 1, userB: 1 }, { unique: true });
schema.statics.normalizePair = function (a, b) {
  const A = a.toString(), B = b.toString();
  return A < B ? { userA: a, userB: b } : { userA: b, userB: a };
};
```

---

### 26. Bookmarks DELETE with BFS subtree cascade
**Commit:** `d24c4e9` · Date: 2026-04-25
**File(s):** `backend/src/routes/bookmarks.js` +17, `backend/tests/bookmarks.test.js` +22

**What I built**
`DELETE /bookmarks/:id` BFS-walks descendant `parentId`s, accumulates IDs into `toDelete`, then issues one `deleteMany({_id:{$in:toDelete}, ownerId})`. Owner-scoped to prevent cross-tenant deletion.

**Resume bullet**
> Implemented owner-scoped recursive bookmark delete using BFS frontier expansion and a single batch `deleteMany`.

**Key code**
```js
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseObjectId(req.params.id, 'id');
    const bm = await Bookmark.findOne({ _id: id, ownerId: req.user.id });
    if (!bm) throw new AppError('NOT_FOUND', 'Bookmark not found', 404);
    const toDelete = [bm._id.toString()];
    let frontier = [bm._id];
    while (frontier.length) {
      const children = await Bookmark.find(
        { parentId: { $in: frontier }, ownerId: req.user.id }, { _id: 1 });
      frontier = children.map(c => c._id);
      for (const c of children) toDelete.push(c._id.toString());
    }
    await Bookmark.deleteMany({ _id: { $in: toDelete }, ownerId: req.user.id });
    res.status(204).end();
  } catch (e) { next(e); }
});
```

---

### 27. Bookmarks PATCH with cycle prevention
**Commit:** `99cb670` · Date: 2026-04-25
**File(s):** `backend/src/routes/bookmarks.js` +34, `backend/tests/bookmarks.test.js` +28

**What I built**
On rename/move, walks the proposed new parent's ancestor chain, builds a lookup, then calls `wouldCreateCycle` from `services/tree`. Rejects self-parenting and reparenting that closes a cycle with `VALIDATION 400`. Only allows `url`/`platform` changes when `kind === 'link'`.

**Resume bullet**
> Added safe reparent/edit semantics to a tree-structured bookmark API with ancestor-walk cycle detection.

**Key code**
```js
if ('parentId' in req.body) {
  const newParent = parseObjectId(req.body.parentId, 'parentId');
  await assertParentOwnedFolder(newParent, req.user.id);
  const ancestors = [];
  let cursor = newParent;
  while (cursor) {
    const parent = await Bookmark.findOne({ _id: cursor, ownerId: req.user.id }, { parentId: 1 });
    if (!parent) break;
    ancestors.push(parent);
    cursor = parent.parentId;
  }
  const lookup = (cid) => ancestors.find(n => n._id.toString() === cid?.toString());
  if (wouldCreateCycle(bm._id, newParent, lookup)
   || (newParent && newParent.toString() === bm._id.toString())) {
    throw new AppError('VALIDATION', 'parentId would create cycle', 400);
  }
  bm.parentId = newParent;
}
```

---

### 28. Bookmarks GET/POST with parent validation
**Commit:** `affa952` · Date: 2026-04-25
**File(s):** `backend/src/routes/bookmarks.js` +73 (new), `backend/src/app.js` +2, `backend/tests/bookmarks.test.js` +67

**What I built**
`GET /bookmarks?parentId=` returns owner-scoped children sorted by `createdAt`. `POST` validates `kind ∈ {folder,link}`, requires `name`, requires `url` when link, and asserts the parent exists, is owned by the requester, and is a folder. ObjectId parsing is centralized through `parseObjectId(value,name)`.

**Resume bullet**
> Built owner-scoped bookmark list/create endpoints with parent-folder validation, kind-aware input requirements, and centralized ObjectId parsing.

**Key code**
```js
async function assertParentOwnedFolder(parentId, ownerId) {
  if (!parentId) return;
  const parent = await Bookmark.findById(parentId);
  if (!parent || parent.ownerId.toString() !== ownerId.toString()) {
    throw new AppError('VALIDATION', 'parentId not found', 400);
  }
  if (parent.kind !== 'folder') {
    throw new AppError('VALIDATION', 'parent must be a folder', 400);
  }
}
```

---

### 29. Bookmark model with folder/link discriminator
**Commit:** `6a8c050` · Date: 2026-04-25
**File(s):** `backend/src/models/bookmark.js` +18 (new)

**What I built**
Single Bookmark schema with `kind: 'folder'|'link'`, owner-indexed `parentId` for fast subtree reads, and a `pre('validate')` hook enforcing `link → url required` and `folder → url forbidden`. Caps `name` at 200 and `url` at 4096.

**Resume bullet**
> Modeled bookmarks as a single discriminated tree with kind-aware validation and indexed parent traversal.

**Key code**
```js
const schema = new mongoose.Schema({
  ownerId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bookmark', default: null, index: true },
  kind:     { type: String, enum: ['folder', 'link'], required: true },
  name:     { type: String, required: true, trim: true, maxlength: 200 },
  url:      { type: String, default: null, maxlength: 4096 },
  platform: { type: String, default: null, maxlength: 64 }
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.pre('validate', function (next) {
  if (this.kind === 'link' && !this.url) return next(new Error('link must have url'));
  if (this.kind === 'folder' && this.url) return next(new Error('folder must not have url'));
  next();
});
```

---

### 30. Tree cycle-prevention helper
**Commit:** `a107556` · Date: 2026-04-25
**File(s):** `backend/src/services/tree.js` +16 (new), `backend/tests/tree.test.js` +23

**What I built**
Pure function `wouldCreateCycle(nodeId, newParentId, findParentNode)` walks parent links from `newParentId`, returns true on hit (`cursor === target`) or revisit (`seen.has`). Decoupled from Mongoose so it's unit-testable with a synchronous lookup.

**Resume bullet**
> Wrote a Mongoose-agnostic cycle-detection utility for tree mutations using ancestor traversal with a visited set.

**Key code**
```js
export function wouldCreateCycle(nodeId, newParentId, findParentNode) {
  if (!newParentId) return false;
  const seen = new Set();
  let cursor = newParentId?.toString();
  const target = nodeId?.toString();
  while (cursor) {
    if (cursor === target) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const node = findParentNode(cursor);
    cursor = node?.parentId ? node.parentId.toString() : null;
  }
  return false;
}
```

---

### 31. Auth rate limit (PER_IP_AUTH_RATE)
**Commit:** `f2006b3` · Date: 2026-04-25
**File(s):** `backend/src/middleware/rateLimit.js` +10 (new), `backend/src/routes/auth.js` +2

**What I built**
`express-rate-limit` middleware: 1-minute window, limit from `process.env.PER_IP_AUTH_RATE` (default 100, dev-friendly), draft-7 standard headers, custom `RATE_LIMITED` error envelope. Mounted on the auth router so it covers signup/login/refresh/logout uniformly.

**Resume bullet**
> Hardened auth endpoints with per-IP rate limiting (env-tunable, draft-7 headers, structured error envelope).

**Key code**
```js
export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: parseInt(process.env.PER_IP_AUTH_RATE || '100', 10),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});
```

---

### 32. Auth refresh + logout (rotating refresh tokens)
**Commit:** `4b60628` · Date: 2026-04-25
**File(s):** `backend/src/routes/auth.js` +23, `backend/tests/auth.test.js` +17

**What I built**
`POST /auth/refresh` validates the presented refresh token via `rotateRefresh` (which revokes the old record and issues a fresh one), looks up the user, and returns a new `accessToken` + the rotated refresh. `POST /auth/logout` revokes the presented refresh token and returns 204; missing tokens still 204 (idempotent).

**Resume bullet**
> Implemented rotating refresh tokens with one-time-use semantics, idempotent logout, and revocation tracking.

**Key code**
```js
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (typeof refreshToken !== 'string') throw new AppError('VALIDATION', 'refreshToken required', 400);
    const rotated = await rotateRefresh(refreshToken);
    const user = await User.findById(rotated.record.userId);
    if (!user) throw new AppError('AUTH_INVALID', 'User missing', 401);
    const accessToken = signAccess({ userId: user._id, username: user.username });
    res.json({ accessToken, refreshToken: rotated.token });
  } catch (e) { next(e); }
});
```

---

### 33. Pre-validate username regex + idempotent model registration
**Commit:** `2afcf4f` · Date: 2026-04-25
**File(s):** `backend/src/routes/auth.js` +6, `backend/src/models/refreshToken.js` ±1, `backend/src/models/user.js` ±1, `backend/tests/auth.test.js` +11, `backend/vitest.config.js` -1

**What I built**
Caught short/invalid usernames at the route layer with a 400 `VALIDATION` instead of 500 from the Mongoose validator. Switched both User and RefreshToken to `mongoose.models.X || mongoose.model(...)` so cross-test-file imports stop tripping `OverwriteModelError`. Removed the now-unneeded `isolate:false` hack from vitest config.

**Resume bullet**
> Replaced 500s with 400s by lifting username validation into the route layer and made model registration idempotent for a shared-fork test runner.

**Key code**
```js
const USERNAME_RE = /^[a-z0-9_-]+$/;
function validateCreds(body) {
  const { username, password } = body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new AppError('VALIDATION', 'username and password required', 400);
  }
  const u = username.toLowerCase();
  if (u.length < 3 || u.length > 32 || !USERNAME_RE.test(u)) {
    throw new AppError('VALIDATION', 'username must be 3-32 chars of [a-z0-9_-]', 400);
  }
  if (password.length < 8) throw new AppError('VALIDATION', 'password must be at least 8 characters', 400);
}
```

---

### 34. Auth signup/login + /me
**Commit:** `95fbdee` · Date: 2026-04-25
**File(s):** `backend/src/routes/auth.js` +56 (new), `backend/src/app.js` +3, `backend/tests/auth.test.js` +55, `backend/tests/helpers.js` +7, `backend/vitest.config.js` ±2

**What I built**
`POST /auth/signup` hashes password and issues access+refresh; `POST /auth/login` does `.select('+passwordHash')` to override the field's `select:false`, verifies with bcrypt, and returns the same envelope. `GET /me` returns the public projection. Configured `singleFork` + sequential pool for vitest so model registry stops collising across files.

**Resume bullet**
> Built signup/login/`/me` endpoints with bcrypt verification, JWT access + refresh issuance, and a `select:false`-aware login query.

**Key code**
```js
router.post('/login', async (req, res, next) => {
  try {
    validateCreds(req.body);
    const user = await User.findOne({ username: req.body.username.toLowerCase() })
                           .select('+passwordHash');
    if (!user) throw new AppError('AUTH_INVALID', 'Invalid credentials', 401);
    const ok = await verifyPassword(req.body.password, user.passwordHash);
    if (!ok) throw new AppError('AUTH_INVALID', 'Invalid credentials', 401);
    const accessToken = signAccess({ userId: user._id, username: user.username });
    const { token: refreshToken } = await issueRefresh(user._id);
    res.json({ accessToken, refreshToken, user: publicUser(user) });
  } catch (e) { next(e); }
});
```

---

### 35. requireAuth middleware (Bearer + AUTH_EXPIRED separation)
**Commit:** `b60d901` · Date: 2026-04-25
**File(s):** `backend/src/middleware/auth.js` +18 (new)

**What I built**
Parses `Authorization: Bearer <jwt>`, calls `verifyAccess`, attaches `{id, username}` to `req.user`, and distinguishes `TokenExpiredError` (`AUTH_EXPIRED`) from any other failure (`AUTH_INVALID`) so clients know whether to refresh vs re-login.

**Resume bullet**
> Wrote bearer-token auth middleware that distinguishes expired-vs-invalid token errors so clients can branch refresh-vs-re-auth flows.

**Key code**
```js
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/);
  if (!match) return next(new AppError('AUTH_INVALID', 'Missing bearer token', 401));
  try {
    const payload = verifyAccess(match[1]);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (e) {
    if (e?.name === 'TokenExpiredError') {
      return next(new AppError('AUTH_EXPIRED', 'Access token expired', 401));
    }
    next(new AppError('AUTH_INVALID', 'Invalid token', 401));
  }
}
```

---

### 36. JWT access + rotating refresh-token service
**Commit:** `c41fd5e` · Date: 2026-04-25
**File(s):** `backend/src/services/tokens.js` +48 (new), `backend/src/models/refreshToken.js` +10 (new), `backend/tests/tokens.test.js` +47

**What I built**
`signAccess({userId,username})` issues HS256 JWTs with configurable TTL. `issueRefresh(userId)` generates 32 random bytes (base64url), stores only `sha256` hash in `RefreshToken{userId, tokenHash, expiresAt, revokedAt}`, returns the plaintext to the caller once. `rotateRefresh` revokes-and-reissues atomically; `revokeRefresh` flips `revokedAt`.

**Resume bullet**
> Built a JWT + opaque-refresh token service with hashed-at-rest storage, one-shot rotation, and explicit revocation.

**Key code**
```js
function generateRefreshToken() { return crypto.randomBytes(32).toString('base64url'); }
function hash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }

export async function issueRefresh(userId) {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 86400 * 1000);
  const record = await RefreshToken.create({ userId, tokenHash: hash(token), expiresAt });
  return { token, record };
}

export async function rotateRefresh(presentedToken) {
  const tokenHash = hash(presentedToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError('AUTH_INVALID', 'Refresh token invalid', 401);
  }
  record.revokedAt = new Date();
  await record.save();
  return issueRefresh(record.userId);
}
```

---

### 37. bcrypt password service
**Commit:** `bd16ef9` · Date: 2026-04-25
**File(s):** `backend/src/services/passwords.js` +11 (new), `backend/tests/passwords.test.js` +11

**What I built**
Two-function module wrapping `bcrypt` at 12 rounds: `hashPassword(plain)` and `verifyPassword(plain, hash)`. Centralizes cost-factor decisions and shields call sites from the bcrypt API.

**Resume bullet**
> Centralized password hashing/verification behind a small service with bcrypt cost-factor 12.

**Key code**
```js
import bcrypt from 'bcrypt';
const ROUNDS = 12;
export async function hashPassword(plain) { return bcrypt.hash(plain, ROUNDS); }
export async function verifyPassword(plain, hash) { return bcrypt.compare(plain, hash); }
```

---

### 38. Sync model indexes in resetDb to prevent test flake
**Commit:** `d145fa9` · Date: 2026-04-25
**File(s):** `backend/tests/helpers.js` +1

**What I built**
Made `resetDb()` call `syncIndexes()` across all registered models before clearing collections, so unique-index races stop differing between fresh-vs-leftover collections inside the same vitest fork.

**Resume bullet**
> Eliminated index-related test flake by syncing all Mongoose model indexes before each reset.

**Key code**
```js
export async function resetDb() {
  await Promise.all(Object.values(mongoose.models).map(m => m.syncIndexes()));
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
}
```

---

### 39. user.passwordHash select:false to prevent accidental leak
**Commit:** `af02b8f` · Date: 2026-04-25
**File(s):** `backend/src/models/user.js` ±1, `backend/tests/user-model.test.js` +10

**What I built**
Set `passwordHash: { select: false }` so default queries omit it. Login explicitly opts in via `.select('+passwordHash')`. Test asserts a vanilla `findOne` returns the user with `passwordHash === undefined`.

**Resume bullet**
> Hardened the User schema by excluding the password hash from default projections and verifying with a regression test.

**Key code**
```diff
-  passwordHash: { type: String, required: true }
+  passwordHash: { type: String, required: true, select: false }
```

---

### 40. User model with username validation
**Commit:** `40c9917` · Date: 2026-04-25
**File(s):** `backend/src/models/user.js` +17 (new), `backend/tests/user-model.test.js` +24

**What I built**
`User{ username, passwordHash }` with `lowercase`, `trim`, length 3–32, regex `/^[a-z0-9_-]+$/`, `unique: true`, and `createdAt`-only timestamps.

**Resume bullet**
> Modeled the User entity with strict username normalization (lowercase, trimmed, regex-validated, length-bounded).

**Key code**
```js
const userSchema = new mongoose.Schema({
  username: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    minlength: 3, maxlength: 32, match: /^[a-z0-9_-]+$/
  },
  passwordHash: { type: String, required: true }
}, { timestamps: { createdAt: true, updatedAt: false } });
```

---

### 41. App factory, config, db connector, structured error handler
**Commit:** `610538a` · Date: 2026-04-25
**File(s):** `backend/src/app.js` +15 (new), `backend/src/config.js` +24 (new), `backend/src/db.js` +10 (new), `backend/src/middleware/error.js` +25 (new), `backend/src/server.js` +17 (new), `backend/tests/health.test.js` +21, `backend/tests/helpers.js` +21

**What I built**
`createApp()` returns a fresh Express instance with `express.json({limit:'256kb'})`, `/health`, and the error-handler chain — separating wiring from listening so tests can drive the app via supertest. `AppError(code, message, status)` plus `errorHandler` translates `AppError`, Mongoose `ValidationError` (→ 400), and dup-key `11000` (→ 409 CONFLICT) into a uniform `{error:{code,message}}` envelope.

**Resume bullet**
> Stood up an Express app factory with structured `{error:{code,message}}` responses translating AppError, ValidationError, and Mongo dup-key into stable HTTP codes.

**Key code**
```js
export class AppError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION', message: err.message } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Duplicate value' } });
  }
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Internal server error' } });
}
```

---

### 42. Backend bootstrap (package, vitest config, docker-compose for Mongo)
**Commit:** `3fa61ef` · Date: 2026-04-25
**File(s):** `backend/package.json` +26, `backend/package-lock.json` +4066, `backend/.env.example` +7, `backend/.gitignore` +5, `backend/docker-compose.yml` +10, `backend/vitest.config.js` +13, `backend/README.md` +14

**What I built**
Initialized Node 20 ESM project with Express, Mongoose, JWT, bcrypt, express-rate-limit. Added Vitest + supertest + mongodb-memory-server for integration tests, a `docker-compose.yml` that brings up local Mongo, and an `.env.example` with all required keys (`MONGO_URL`, `JWT_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TTL_DAYS`, `CORS_ORIGINS`).

**Resume bullet**
> Bootstrapped a Node 20 ESM backend (Express, Mongoose, JWT) with Vitest + in-memory-Mongo integration testing and Docker-Compose-based local dev.

**Key code**
```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: [mongo-data:/data/db]
volumes:
  mongo-data:
```

---

### 43. Backend core implementation plan + design spec
**Commit:** `35789ed` + `f897751` · Date: 2026-04-25
**File(s):** `docs/superpowers/plans/2026-04-25-backend-core.md` +2795, plus `urlgram Spec A` design doc

**What I built**
Authored a 24-task TDD implementation plan plus the design spec it traces to (auth, bookmarks, friends, groups, group folders, chat, share, todos). Each task lists the failing tests to write first, the minimum-passing implementation, and the acceptance criteria; the rest of the April 25 commits are a one-to-one execution of this plan.

**Resume bullet**
> Authored a 24-task TDD implementation plan covering auth, bookmarks, social graph, groups, chat, and share, then executed it as 28 sequential commits in one day.

**Key code**
```markdown
## Task 6 — Bookmarks PATCH with cycle prevention
Tests:
- moving folder under itself → 400 VALIDATION
- moving folder under its own descendant → 400 VALIDATION
- valid reparent → 200, parentId updated
Implementation hint: walk ancestor chain from newParentId upward;
if you hit nodeId you have a cycle.
Acceptance: GET /bookmarks?parentId=<old> excludes moved node.
```

---

## Part 2 — Major Features Shipped (Solo Project, Last 12 Months)

Since this is a solo repo, "team features" instead reads as the major shippable units the codebase delivered. Each unit groups related commits.

### A. Auth subsystem (signup → login → refresh → logout, with rate-limiting)
**Commits:** `40c9917`, `af02b8f`, `bd16ef9`, `c41fd5e`, `b60d901`, `95fbdee`, `2afcf4f`, `4b60628`, `f2006b3` (Apr 25 sequence)
**Scope:** `models/user.js`, `models/refreshToken.js`, `services/passwords.js`, `services/tokens.js`, `middleware/auth.js`, `middleware/rateLimit.js`, `routes/auth.js`

**What it does**
Username/password signup with bcrypt(12) hashing, login with `select:'+passwordHash'`, JWT (HS256) access tokens, opaque rotating refresh tokens stored as `sha256(token)` only, idempotent logout, and per-IP rate limiting (`PER_IP_AUTH_RATE`, default 100/min). Bearer middleware separates `AUTH_EXPIRED` from `AUTH_INVALID` so clients know when to refresh.

**Key code**
```js
export async function rotateRefresh(presentedToken) {
  const tokenHash = hash(presentedToken);
  const record = await RefreshToken.findOne({ tokenHash });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new AppError('AUTH_INVALID', 'Refresh token invalid', 401);
  }
  record.revokedAt = new Date();
  await record.save();
  return issueRefresh(record.userId);
}
```

---

### B. Bookmark tree (folders + links, owner-scoped, cycle-safe)
**Commits:** `6a8c050`, `a107556`, `affa952`, `99cb670`, `d24c4e9`
**Scope:** `models/bookmark.js`, `services/tree.js`, `routes/bookmarks.js`, `tests/{tree,bookmarks}.test.js`

**What it does**
A single discriminated `Bookmark{kind:'folder'|'link'}` collection backs the user's entire library. CRUD endpoints validate parent-folder ownership, reject cycles on PATCH via ancestor walk, and cascade-delete subtrees with BFS frontier expansion + a single `deleteMany`. All queries are scoped by `ownerId` so cross-tenant access is structurally impossible.

**Key code**
```js
export function wouldCreateCycle(nodeId, newParentId, findParentNode) {
  if (!newParentId) return false;
  const seen = new Set();
  let cursor = newParentId?.toString();
  const target = nodeId?.toString();
  while (cursor) {
    if (cursor === target) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const node = findParentNode(cursor);
    cursor = node?.parentId ? node.parentId.toString() : null;
  }
  return false;
}
```

---

### C. Social graph (friends + DMs as auto-provisioned groups)
**Commits:** `adbf0ea`, `4607837`, `16fcb93`, `7dbfcf3`, plus `5545540` for DM-on-share
**Scope:** `models/friendship.js`, `routes/friends.js`, `middleware/auth.js` (`requireFriendOf`), `routes/share.js`

**What it does**
Friendships are stored with a normalized `(userA, userB)` pair (lower hex first) under a unique compound index, so the relation is always one row regardless of direction. Endpoints cover request/accept/list/inbox/delete (delete handles both reject and unfriend). Sharing to a `userId` auto-creates a 2-person `Group` named `DM @x ↔ @y` reused on subsequent shares, gated by accepted-friendship.

**Key code**
```js
schema.statics.normalizePair = function (a, b) {
  const A = a.toString(), B = b.toString();
  return A < B ? { userA: a, userB: b } : { userA: b, userB: a };
};
```

---

### D. Groups: tree-structured groups + admin moderation + folders
**Commits:** `8dc2b0e`, `4a03b20`, `58e8fd5`, `5bc1fd2`, `7dbfcf3`, `66bce49`
**Scope:** `models/{group,joinRequest,groupMember,groupFolder}.js`, `routes/groups.js`, `middleware/auth.js`

**What it does**
Groups support optional `parentGroupId` for subgroups (gated by parent membership). Creator becomes admin via auto-inserted `GroupMember{role:'admin'}`. Join is request-based: `POST /:id/join` creates `JoinRequest{status:'pending'}`, admins approve via atomic `$setOnInsert` upsert into `GroupMember`. Per-group folders form their own tree with admin-only writes and BFS cascade delete.

**Key code**
```js
await GroupMember.updateOne(
  { groupId: jr.groupId, userId: jr.userId },
  { $setOnInsert: { groupId: jr.groupId, userId: jr.userId, role: 'member' } },
  { upsert: true }
);
```

---

### E. Chat + Share (per-group URL messages, multi-target broadcast)
**Commits:** `40f97bd`, original `share.js` in `452e50a`, evolution in `5545540`
**Scope:** `models/chatMessage.js`, `routes/chat.js`, `routes/share.js`

**What it does**
`POST /share` accepts any combination of `groupIds` and `userIds`, validates each (membership for groups, accepted-friendship for users), auto-provisions DM groups when needed, and `insertMany` writes one ChatMessage per resolved group. `GET /groups/:id/chat?before=&limit=` returns paginated history capped at 100, sorted by `createdAt` desc.

**Key code**
```js
const docs = Array.from(targetGroupIds).map(gid => ({
  groupId: gid, senderId: req.user.id, kind,
  url: typeof url === 'string' ? url.trim() : null,
  text: typeof text === 'string' ? text.trim().slice(0, 4000) : null,
  title: typeof title === 'string' ? title.trim().slice(0, 400) : null,
  platform: typeof platform === 'string' ? platform.slice(0, 64) : null,
  payload: payload || null
}));
const created = await ChatMessage.insertMany(docs);
```

---

### F. Frontend extension (Manifest V3, popup + dashboard + content overlay)
**Commits:** `cc4183c`, `10da251`, `e76dfe8`, `84235c0`, `61505aa`, `b857b57`, `8657f66`, `2daaed3`, `f8c8ccb`
**Scope:** `frontend/popup/`, `frontend/dashboard/`, `frontend/content/floating.js`, `frontend/components/`, `frontend/lib/`, `frontend/manifest.json`

**What it does**
Manifest V3 extension with login form + token storage (`AuthManager`), Miller-columns explorer for navigating bookmark trees with hover-to-drill (180 ms intent), inline rename, hover-open context menus, and a Linear-style Todo board (projects × statuses × tasks) backed by `chrome.storage.local`. A content-script floating bubble (100×79 px) opens an in-page panel positioned via priority-ordered viewport-fit placement. Themed via `DESIGN.md` with a unified currentColor SVG icon set.

**Key code**
```js
const candidates = [
  { x: bx + BUBBLE + GAP, y: by },
  { x: bx - GAP - pw,     y: by },
  { x: bx, y: by + BUBBLE + GAP },
  { x: bx, y: by - GAP - ph },
  { x: bx + BUBBLE + GAP, y: by + BUBBLE - ph },
  { x: bx - GAP - pw,     y: by + BUBBLE - ph },
];
for (const c of candidates) {
  if (c.x >= 0 && c.y >= 0 && c.x + pw <= vw && c.y + ph <= vh) {
    panel.style.left = c.x + 'px';
    panel.style.top  = c.y + 'px';
    return;
  }
}
```

---

### G. Bookmarks importer + browser-bookmark sync (one-way → two-way)
**Commits:** `cc4183c` (importer + initial one-way mirror), `f1f5ec0` (remove auto-runner), `21430fa` (manual two-way merge)
**Scope:** `frontend/lib/bookmarks-import.js`, `frontend/lib/bookmarks-sync.js`, `frontend/background.js`, `frontend/popup/popup.{html,js}`

**What it does**
Imports any browser's exported HTML (Netscape bookmark format) by parsing `<DL><DT>` recursively, unwrapping system folders ("Bookmarks Toolbar", "Other Bookmarks", etc.) and skipping URLs already present anywhere in the extension. Two-way sync against the toolbar resolves cross-vendor IDs, walks urlgram → browser (creates + updates), then browser → urlgram (additive only), with reverse-maps to skip already-linked nodes. No deletes either way.

**Key code**
```js
async pushurlgram(items, rootId, map) {
  const folders = items.filter(b => b.kind === 'folder');
  const links   = items.filter(b => b.kind === 'link');
  for (const f of this.topoFolders(folders)) {
    const parentBmId = f.parentId ? map.folders[f.parentId] : rootId;
    if (!parentBmId) continue;
    const existing = map.folders[f.id];
    const node = existing ? await this.getNode(existing) : null;
    if (!node) {
      const created = await browser.bookmarks.create({ parentId: parentBmId, title: f.name });
      map.folders[f.id] = created.id;
      map.reverseFolders[created.id] = f.id;
    } else if (node.title !== f.name) {
      try { await browser.bookmarks.update(existing, { title: f.name }); } catch (_) {}
    }
  }
  /* links branch elided */
}
```

---

### H. Vercel serverless deployment + Docker-Compose dev workflow
**Commits:** `3fa61ef` (compose), `58cf46e` (vercel adapter), `ef73fec` (build hook)
**Scope:** `backend/docker-compose.yml`, `backend/api/index.js`, `backend/vercel.json`, `backend/.vercelignore`

**What it does**
Local dev uses `docker compose up` for Mongo plus `npm run dev` (`node --watch`). Production runs the same Express app under Vercel's Node runtime via `api/index.js`, which lazily caches one app instance and one Mongoose connection per cold container, with a `vercel.json` rewrite sending all paths to the single handler.

**Key code**
```js
let appPromise = null;
async function getApp() {
  if (appPromise) return appPromise;
  appPromise = (async () => {
    validateConfig();
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(config.mongoUrl);
    }
    return createApp();
  })();
  return appPromise;
}
export default async function handler(req, res) {
  const app = await getApp();
  return app(req, res);
}
```

---

### I. Test infrastructure (Vitest + in-memory Mongo + idempotent models)
**Commits:** `3fa61ef`, `d145fa9`, `2afcf4f`, plus per-feature `*.test.js` (auth, bookmarks, friends, groups, chat, etc.)
**Scope:** `backend/vitest.config.js`, `backend/tests/helpers.js`, `mongoose.models.X || mongoose.model(...)` across all models

**What it does**
Tests run against `mongodb-memory-server` with a single forked worker (`pool:'forks', singleFork:true`) and sequential execution, so all tests share one Mongoose registry. Models register idempotently (`mongoose.models.X || mongoose.model(...)`) to survive cross-file imports under that registry. `resetDb()` runs `syncIndexes()` before clearing collections to remove unique-index race flake.

**Key code**
```js
export async function resetDb() {
  await Promise.all(Object.values(mongoose.models).map(m => m.syncIndexes()));
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
}
```

---

## Part 3 — Resume Highlights (drop-in copy)

> **Full-Stack Engineer · urlgram (personal product)** · 2026 (Node.js, Express, MongoDB/Mongoose, JWT, Vitest, Manifest V3, Vercel)
>
> - Built a full bookmark-management product end-to-end: Manifest V3 browser extension (Firefox + Chrome) plus an Express/Mongoose backend deployed on Vercel serverless.
> - Designed a JWT auth subsystem with HS256 access tokens, opaque rotating refresh tokens stored as `sha256` hashes only, one-time-use rotation, idempotent logout, and per-IP rate limiting; middleware separates `AUTH_EXPIRED` from `AUTH_INVALID` so clients can branch refresh-vs-re-auth.
> - Modeled a tree-structured bookmark store with kind-aware (folder/link) validation, owner-scoped queries, ancestor-walk cycle prevention on reparent, and BFS-frontier subtree cascade delete in a single batch `deleteMany`.
> - Implemented a social graph using normalized `(userA, userB)` friendship pairs under a unique compound index for single-row representation, plus three reusable Express auth-middleware factories (`requireFriendOf`, `requireGroupMember`, `requireGroupAdmin`) that resolve and attach domain entities for downstream handlers.
> - Built tree-structured groups (with subgroups gated by parent membership), a join-request workflow with atomic `$setOnInsert` membership upsert on approve, and per-group folders with admin-only writes and BFS cascade delete.
> - Designed a unified share API broadcasting URL/text/folder/bookmark messages to any combination of groups and users; user-targets auto-provision a reusable 2-person DM group, gated by accepted-friendship — letting share, chat, and DMs share one storage path.
> - Authored a 24-task TDD implementation plan tracing to a written design spec and executed it as 28 sequential test-first commits in one day; backed by Vitest, supertest, and `mongodb-memory-server` with single-fork sequential isolation and `syncIndexes()`-on-reset to eliminate index-race flake.
> - Shipped a Miller-columns bookmark explorer in vanilla JS (hover-to-drill, inline rename, hover-open context menus, currentColor SVG icon set themed from a published `DESIGN.md`), plus a Linear-style Todo board (projects × custom statuses × tasks) persisted via `chrome.storage.local`.
> - Wrote a Netscape bookmark-format importer that recursively parses `<DL><DT>` HTML, unwraps locale-specific system folders ("Bookmarks Toolbar" / "Other Bookmarks" / etc.), and dedupes by normalized URL.
> - Built bidirectional, idempotent sync between urlgram and the browser's bookmarks toolbar with cross-vendor toolbar resolution (well-known IDs → locale-title match → first-folder fallback) and additive-only conflict policy ("no loss" guarantee, re-running Sync is a no-op).
> - Adapted the Express app for Vercel serverless using a lazily-cached app + Mongoose connection per cold container, with one `vercel.json` rewrite to a single `/api/index` handler — same code paths run locally via Docker-Compose-backed Mongo.
