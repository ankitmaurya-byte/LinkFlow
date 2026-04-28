# LinkFlow

A modern bookmark + collaboration browser extension. Saves links, folders, todos, and a project Kanban to a backend, so all data is per-user and survives reinstall. Includes a floating widget that lives on every page, friend/group sharing, group chat, and a popup with a Finder-style column tree.

---

## Repository layout

```
backend/   Express + MongoDB API (auth, bookmarks, todos, friends, groups, chat, share)
frontend/  Browser extension (manifest v3, popup, dashboard, playground, content scripts)
docs/      Snippets and reference notes
```

---

## Features

### Authentication

- Username + password signup / login (rate-limited).
- Username uniqueness enforced server-side. Duplicate signup returns `USERNAME_TAKEN` 409 and the login form shows "Username already taken."
- JWT access token + refresh token rotation. Auto-refresh on `AUTH_EXPIRED`.
- Login overlay gates the popup; on logout the data clears locally and reloads.

### Per-user persistence

- Every link, folder, todo project, status, task, friend, group, and chat message is stored in MongoDB scoped by `ownerId`.
- After a reinstall or a fresh login on a new browser, the popup pulls everything from the server.
- Local `chrome.storage.local` is now only used for the access/refresh tokens, current view, and the floating-widget position.

### Popup — link tree

- Hover-expand left sidebar (48 px → 200 px). Items: Links, Todo, Playground, Dashboard, Settings.
- Settings opens a small dropdown with Profile + Log out.
- Top-right "settings square" is gone; everything lives in the sidebar.
- Search bar at top.
- Finder-style column view: each column shows folders + links of the current node; clicking a folder opens a new column to the right. Columns share width equally and scroll horizontally as you go deeper.
- Each column has a sticky action row with three icon buttons (💾 Save current tab, 🔗 Paste URL, 📁 New folder). Hovering an action button expands it to show the label.
- Inline rename: double-click any folder, link, project, status, or task. Enter saves, Esc cancels. ✏️ button on each row also triggers inline edit.
- Right-click on a Kanban task to delete.
- Three-dot context menu on each row (rename / move / delete).

### Floating widget (content script)

- Tiny LinkFlow bubble injected on **every** page through a Shadow-DOM host.
- Hover the bubble → 720×560 panel slides in containing the full popup as an iframe (with `?embed=1` so it adapts).
- Drag-and-drop in the iframe (Kanban moves) is detected via `postMessage` and locks the auto-close so panels stay open during a drag.
- Double-click the bubble to cycle position: top-left → top-right → bottom-right → bottom-left. Position is persisted in `chrome.storage.local` and restored on every page load and after browser restart.

### Todo + Kanban

- Todo nav opens a two-column area: collapsed projects column (48 px → 220 px on hover), full Kanban to the right.
- "+" creates an "Untitled" project and immediately focuses the inline editor for renaming. Same flow for "+ Add status" and "+ Add task".
- Each project gets three default statuses: Todo / In Progress / Done. Add as many more as you want via "+ Add status".
- Kanban tasks: drag between columns, reorder within a column (computed via `getDragAfterElement`), double-click to inline-edit, right-click to delete.
- All projects, statuses, tasks, and orderings are saved server-side as a single per-user JSON document.

### Playground (inline view, also embeddable)

Opens inline inside the popup (no new tab, no header). Four tabs:

1. **Friends** — send a friend request by username, see incoming requests, accept them.
2. **Groups** — create a group (auto-generates an 8-character invite code shown in the row), copy the invite code to clipboard, or join a group by entering someone else's code (no admin approval needed).
3. **Chat** — pick any group you belong to, see chronological messages with sender username and timestamp, send text messages. Shared URLs, folders, and bookmarks are rendered inline (link list for folder shares).
4. **Share** — pick the kind to share (custom URL / saved bookmark / folder with all its links), add an optional note, multi-select target groups, and post. The folder share embeds all of the folder's child links into the message payload.

### Dashboard

Opened via the sidebar Dashboard icon (in a new tab — large screen view). Shows the same data with grid/list mode, sorting, and the bookmarks-import flow.

### Other

- "Save current tab" pulls the active tab's URL + title via the background worker, detects the platform (YouTube / GitHub / Twitter / Reddit / Medium / Stack Overflow) for an icon, and creates a link in the current column's folder.
- Browser bookmarks → LinkFlow background sync (existing module).

---

## Backend API (mounted in `backend/src/app.js`)

| Method | Path                                  | Notes                                                           |
|--------|---------------------------------------|-----------------------------------------------------------------|
| POST   | `/auth/signup`                        | Returns `USERNAME_TAKEN` 409 on duplicate.                      |
| POST   | `/auth/login`                         |                                                                 |
| POST   | `/auth/refresh`                       | Rotates refresh tokens.                                         |
| POST   | `/auth/logout`                        | Revokes refresh.                                                |
| GET    | `/me`                                 |                                                                 |
| GET    | `/bookmarks?tab=&parentId=`           | Folders + links of the current owner. `tab` field added.        |
| POST   | `/bookmarks`                          | Body: `{tab, parentId, kind, name, url?, platform?}`.           |
| PATCH  | `/bookmarks/:id`                      | Rename / move (`tab`, `parentId`) / update url.                 |
| DELETE | `/bookmarks/:id`                      | Cascades to children.                                           |
| GET    | `/todos`                              | Per-user todo doc (projects / statuses / tasks).                |
| PUT    | `/todos`                              | Replace the whole doc (client owns the merging).                |
| POST   | `/friends/request`                    | Body: `{username}`.                                             |
| GET    | `/friends/requests`                   | Splits incoming / outgoing pending.                             |
| POST   | `/friends/:id/accept`                 |                                                                 |
| GET    | `/friends`                            | Accepted friends.                                               |
| DELETE | `/friends/:id`                        |                                                                 |
| POST   | `/groups`                             | Auto-generates 8-character `inviteCode` (A-Z, 2-9).             |
| GET    | `/groups`                             |                                                                 |
| POST   | `/groups/join-by-code`                | Body: `{code}`. Direct join, no admin approval.                 |
| POST   | `/groups/:id/invite-code/regen`       | Admin only.                                                     |
| GET    | `/groups/:id/members`                 |                                                                 |
| GET    | `/groups/:id/chat`                    | Sorted chronologically; includes `senderUsername`.              |
| POST   | `/groups/:id/chat`                    | `kind: text \| url \| folder \| bookmark`.                      |
| POST   | `/share`                              | Body: `{groupIds[], kind, url?, text?, title?, payload?}`. Posts to every group the caller is a member of. |

### Models (`backend/src/models/`)

- `user` — username unique, password hash.
- `bookmark` — `ownerId`, `parentId`, `tab`, `kind` (`folder|link`), `name`, `url`, `platform`.
- `todoData` — `{ ownerId, data: { projects, statuses, tasks } }`.
- `group` — adds `inviteCode` (unique sparse).
- `groupMember`, `joinRequest`, `groupFolder`, `friendship`, `chatMessage`, `refreshToken`.
- `chatMessage` — `kind: url | text | folder | bookmark`, plus `text`, `payload` for structured shares.

---

## Local development

### Backend

```bash
cd backend
npm install
# .env contains MONGO_URI, JWT_SECRET, etc.
npm run dev
```

The frontend talks to `http://localhost:4000` (`API_BASE` in `frontend/lib/api.js`).

### Frontend (Firefox)

1. `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → select `frontend/manifest.json`.
2. Reload the add-on after backend changes; the content script needs a page reload to pick up new code.

### Frontend (Chromium)

The manifest is MV3-compatible. `chrome://extensions` → Developer mode → Load unpacked → pick `frontend/`.

---

## Notable structural choices

- **Column tree, not nested tree.** The popup uses a Finder-style column layout because hover/touch expansion of a deeply nested tree is awkward in 720 × 560.
- **Single TodoData document per user.** Kanban writes are infrequent and small; treating the whole structure as one JSON doc avoids a chatty API and lets the client do trivial reorder/move logic locally before `PUT`-ing back.
- **Iframe-based reuse.** The floating widget and the popup's Playground both iframe the popup's own pages with `?embed=1` rather than re-implementing UI.
- **Drag detection across iframe boundary.** `dragstart` posts a message to the parent so the floating panel doesn't auto-close mid-drag.
- **Invite codes, not invite URLs.** Groups expose a short, copyable code so users can share it via any channel.

---

## Known gaps / TODO

- Friend "Remove" button is disabled in the playground — `/friends` GET doesn't currently return the friendship id.
- Direct messages between friends use a 2-person group as a workaround.
- Bookmark import (`bookmarks-import.js`) still writes to `chrome.storage.local`; it doesn't yet sync into the backend.
- Existing groups created before the invite-code change have `inviteCode = null`; admins should regenerate via `/groups/:id/invite-code/regen` or recreate.
