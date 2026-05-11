# urlgram

A browser extension that turns the new-tab moment into a workspace. Bookmarks, todos, notes, chats, and a pile of small productivity modules all live behind one floating bubble that follows you to every page. Everything is per-user and backend-backed, so a fresh browser install pulls your full state on login.

---

## Repository layout

```
backend/   Express + MongoDB API (auth, bookmarks, todos, friends, groups, chat, notes, blogs, feed, subscriptions, feature requests, upload signing)
frontend/  MV3 extension — popup, floating content script, dashboard, and per-module mini-apps (canvas, github, feed, clocks, timer, blogs, newsletters, startups, tabs, playground)
docs/      Snippets and reference notes
```

---

## Highlights

### Floating bubble (every page)

- urlgram icon injected via Shadow DOM on every site that matches the user's site-mode (whitelist-default or blacklist-default — configurable in Settings).
- Free drag anywhere; position is clamped to the viewport and persisted across reloads / browser restarts.
- Click → 720 × 560 panel. Double-click → lock so the panel stays open while you click outside.
- Panel auto-fits: picks the best of 6 candidate spots so the bubble itself is never inside the panel.
- Bottom-right resize handle; size persists.
- Drag start inside the iframe is bridged to the host via `urlgram-drag` `postMessage` so the panel does not close mid-drag.

### Popup — Links

- Hover-expand sidebar (48 → 200 px). Items: Links, Todo, Notes, Tabs, Chats, Playground, Dashboard, Account.
- **Two view modes** with hover-to-switch toggle in the search bar:
  - **Column** — Finder-style columns; hovering a folder auto-opens the next column. Popup auto-grows in width as you drill deeper.
  - **Explorer** — file-manager grid of icon tiles with breadcrumbs, an Up button, and the same action row.
- Drag + drop in either mode: into folders, between tabs, or to reorder within a list (`position` field + bulk-write `/bookmarks/reorder`).
- **Ctrl/Cmd+V anywhere** in the links view pastes a URL straight into the folder under the cursor — no modal, no name prompt. Title defaults to URL hostname.
- Right-click on any row opens a custom context menu (Edit / Share / Delete + folder-only Open all / Share folder).
- Inline rename via double-click. Search filters folders + links across the visible columns.
- Action row per column: Save current tab, Save & close, New folder.

### Todo — Kanban

- Two-column layout (Projects + Kanban). Projects column auto-collapses to 48 px when the cursor is on the kanban side; expands when you hover it back.
- Hover any project row to open it (180 ms debounce).
- Search bar above the board filters tasks by title / description / labels.
- Each Kanban column has a chevron + count badge — click to collapse to a vertical strip showing the column name rotated 90°.
- Default statuses: Todo / In Progress / Done. Add as many as you want.
- Cards: drag between columns, reorder within, double-click to rename, right-click to delete.
- Hover the expand button (or click) to open the Jira-style task detail popover anchored next to the card with title / description / type / priority / status / assignees / reporter / labels / dueDate / comments. Projects column stays collapsed while the popover is open.
- All projects, statuses, tasks, and orderings are saved server-side as a single per-user JSON document.

### Notes (Notion-clone)

- Block editor with paragraph / h1-3 / bullet / numbered / todo / code / quote / callout / divider / image / nested page / table.
- `/` slash menu, drag-handle (`::`) on the left of each block, insert-after, Enter splits the block at the caret.
- Page nesting via parent-child relations.
- Image upload to Cloudinary via signed backend endpoint.
- Public / private toggle with copy-link share.
- Templates: Blank, Meeting notes, Daily journal, Project plan.
- Hover any note in the list to open it.

### Chats

- Single sidebar listing DMs and group chats together; user search at the top doubles as friend-finder (status: none / requested / incoming / friend).
- Friend requests section appears when there are incoming requests.
- DMs auto-create a pairwise group on first message via `POST /groups/dm`.
- Hover any chat row to open it.
- **Composer**:
  - **Slash commands** — `/send link`, `/send folder`, `/send todo`, `/help`. `/help` lists commands and formatting syntax.
  - **Mentions** — typing `@` shows your friends first then other users; selection inserts a styled chip and rides along in `mentions[]`.
  - **Markdown** — `**bold**`, `*italic*`, `~~strike~~`, `__underline__`, `` `code` ``, plus auto-link of URLs and `\n` → `<br>`.
  - **Reply** — double-click a message OR click the `↩` icon that appears on hover. A preview sits above the composer with × to cancel; the reply snippet is rendered as a quoted block on the new message.
  - **React** — `😊` icon on hover opens an emoji popover (`👍 ❤️ 😂 🎉 🔥 👀`); reactions are stored as `{ emoji: [userIds] }` and shown as toggleable chips below the message.
- Sending a message appends it locally — no full reload, scroll position preserved.

### Playground hub

Opens inline (no new tab, no header). Mirrors the Todo layout: left column lists modules, right pane shows the welcome card / feature requests until a module is selected. Hovering a module opens it immediately.

Modules:

- **Canvas** — self-built vector drawing tool (rect / ellipse / line / arrow / pen / text / eraser / select), undo/redo, PNG export, localStorage persist. No remote scripts (CSP-clean).
- **GitHub explorer** — repo search + 2-pane (list + commits/issues/PRs). Optional PAT.
- **Feed** — posts, comments, likes (`/feed/*` endpoints).
- **Startup explorer** — Hacker News (top / show / jobs) + Product Hunt RSS + GitHub trending. Stale-while-revalidate cache merge by id.
- **Clocks** — multi-timezone clocks.
- **Timer** — Pomodoro / short / long / custom.
- **Blogs** — list (My / Public) + editor with cover, public toggle, copy link.
- **Newsletters** — RSS subscriptions + items via server-side `/subscriptions/proxy?url=` and DOMParser.
- **Tab manager** — see below.

The hub also exposes a "Request a feature" form and renders the user's own feature requests with status (pending / planned / in-progress / done / rejected).

### Tab manager

- **Active** — every open tab in the window, grouped by Chrome tab group with the same colored containers as the browser; drag tabs to reorder (`tabs.move`) or to group them (`tabs.group`). Tab group title + color cycle inline; ungroup with one click. "Bookmark + close" opens a folder picker (with `+ Add folder` inline).
- **Sessions** — save the current window as a named session, restore later, list shows tab count + first 5 titles.
- **Snooze** — close idle tabs after N minutes (or bookmark-then-close into a `Snoozed` folder). Per-host overrides and a default minute count.

Iframe ↔ background message bridge for `tabs` / `tabGroups` / `bookmarks` APIs since the extension popup runs inside an iframe and can't call those directly.

### Settings

- Text + background color (live-applied via CSS custom properties).
- Floating-widget mode: whitelist-default ("show everywhere except…") or blacklist-default ("hide everywhere except…"). + Add current tab buttons populate either list.
- Notifications enable toggle.

### Account

- Username + password signup / login. Username uniqueness enforced; duplicate signup returns `USERNAME_TAKEN` 409.
- JWT access + refresh token rotation, auto-refresh on `AUTH_EXPIRED`.
- Login overlay gates the popup; logout clears local data and reloads.

---

## Backend API (mounted in `backend/src/app.js`)

| Method | Path                                  | Notes                                                           |
|--------|---------------------------------------|-----------------------------------------------------------------|
| POST   | `/auth/signup`                        | Returns `USERNAME_TAKEN` 409 on duplicate.                      |
| POST   | `/auth/login`                         |                                                                 |
| POST   | `/auth/refresh`                       | Rotates refresh tokens.                                         |
| POST   | `/auth/logout`                        | Revokes refresh.                                                |
| GET    | `/me`                                 |                                                                 |
| GET    | `/users/search?q=`                    | Empty `q` returns up to 20 users (friends prioritized).         |
| GET    | `/bookmarks?tab=&parentId=`           | Sorted by `position` then `createdAt`.                          |
| POST   | `/bookmarks`                          | `{tab, parentId, kind, name, url?, platform?}`.                 |
| PATCH  | `/bookmarks/:id`                      | Rename / move (`tab`, `parentId`) / update url. Cycle-checked.  |
| DELETE | `/bookmarks/:id`                      | Cascades to children.                                           |
| POST   | `/bookmarks/reorder`                  | `{tab, parentId, orderedIds[]}` bulk-writes `position`.         |
| GET    | `/todos` · PUT `/todos`               | Per-user todo JSON document (projects / statuses / tasks).      |
| GET / POST / PATCH / DELETE | `/notes` `/notes/:id`   | Block-based notes with `parentNoteId`, `isPublic`, `publicSlug`.|
| POST   | `/friends/request`                    | `{username}`.                                                   |
| GET    | `/friends/requests`                   | Incoming / outgoing pending split.                              |
| POST   | `/friends/:id/accept` · `/reject`     |                                                                 |
| GET    | `/friends`                            | Accepted friends.                                               |
| DELETE | `/friends/:id`                        |                                                                 |
| POST   | `/groups`                             | Auto-generates 8-character `inviteCode`.                        |
| GET    | `/groups`                             | `memberCount`, `isDm`, `peerUsername`.                          |
| POST   | `/groups/dm`                          | `{userId}` find-or-create pairwise DM group.                    |
| POST   | `/groups/join-by-code`                | `{code}`. Direct join.                                          |
| POST   | `/groups/:id/invite-code/regen`       | Admin only.                                                     |
| GET    | `/groups/:id/members`                 |                                                                 |
| GET    | `/groups/:id/chat`                    | Includes `replyTo` snippet, `mentions`, `reactions`.            |
| POST   | `/groups/:id/chat`                    | `kind: text \| url \| folder \| bookmark \| todo`. Body may include `replyToId`, `mentions[]`. |
| POST   | `/groups/:id/chat/:msgId/react`       | `{emoji}` toggles per-user reaction.                            |
| POST   | `/share`                              | `{groupIds[], userIds[], kind, url?, text?, title?, payload?}`. Auto-creates DM groups for `userIds`. |
| GET / POST / PATCH / DELETE | `/blogs`                | Long-form posts with cover image, `isPublic`, `slug`.           |
| GET / POST / DELETE | `/subscriptions`               | RSS subscriptions.                                              |
| GET    | `/subscriptions/proxy?url=`           | Server-side fetch for RSS / Atom (browser CORS bypass).         |
| GET / POST / PATCH | `/feed/posts` `/feed/posts/:id/comments` `/feed/posts/:id/likes` | Mini social feed.            |
| GET / POST | `/feature-requests`               | Per-user CRUD; admin can change status.                         |
| POST   | `/upload/sign`                        | Returns Cloudinary SHA-1 signature for direct uploads.          |

### Models (`backend/src/models/`)

- `user`, `bookmark`, `todoData`, `note`, `blog`, `subscription`, `featureRequest`, `post`, `postComment`, `postLike`.
- `group`, `groupMember`, `joinRequest`, `groupFolder`, `friendship`, `refreshToken`.
- `chatMessage` — `kind`, `text`, `url`, `title`, `platform`, `payload`, `replyToId`, `mentions[]`, `reactions{}`.

---

## Local development

### Backend

```bash
cd backend
npm install
# .env contains MONGO_URI, JWT_SECRET, CLOUDINARY_*, etc.
npm run dev
```

The frontend talks to `http://localhost:4000` or `https://urlgram-be.vercel.app` (toggle `API_BASE` in `frontend/lib/api.js`).

### Frontend (Firefox)

1. `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → select `frontend/manifest.json`.
2. Reload the add-on after backend changes; the content script needs a page reload to pick up new code.

### Frontend (Chromium)

The manifest is MV3-compatible. `chrome://extensions` → Developer mode → Load unpacked → pick `frontend/`.

---

## Notable structural choices

- **Column tree, not nested tree.** Hover/touch expansion of a deeply nested tree is awkward in 720 × 560; columns scale with width.
- **Two view modes for links.** Column for fast drilldown, Explorer for spatial overview. Hover-to-switch on the toolbar buttons.
- **Single TodoData JSON document per user.** Kanban writes are small and infrequent; one document avoids a chatty API and lets the client own merge logic.
- **Iframe-based reuse.** Floating widget, popup Chats, popup Tabs, and Playground modules all iframe their own pages with `?embed=1` rather than re-implementing UI.
- **Background message bridge.** Iframes lack `browser.tabs` / `tabGroups` / `bookmarks` APIs, so the popup's modules proxy these calls through `runtime.sendMessage` to the background script.
- **API response cache.** 30 s TTL + in-flight de-dup; mutations invalidate the resource root.
- **Stale-while-revalidate.** Startup Explorer merges cached results with fresh fetches by id so the UI stays populated during refresh.
- **Self-contained canvas.** No remote scripts (Firefox MV3 disallows external `script-src` in extension pages); shapes are rendered with raw SVG / canvas.
- **Drag detection across iframe boundary.** `dragstart` posts a message to `window.top` so the floating panel does not auto-close mid-drag (top, not parent — tabs iframe is two levels deep).
- **Invite codes, not invite URLs.** Groups expose a short copyable code so users can share it via any channel.

---

## Known gaps

- Todo task assignees are stored as plain strings; cross-user task sharing (with `memberIds` on Project / Task models) is not yet wired up.
- Friend "Remove" button is disabled — `/friends` GET doesn't return the friendship id.
- Bookmark import still writes to `chrome.storage.local`; backend sync is via the Account → Sync bookmarks button, which streams the browser's bookmarks tree into the API.
- Existing groups created before invite codes have `inviteCode = null`; admins should regenerate via `/groups/:id/invite-code/regen`.
