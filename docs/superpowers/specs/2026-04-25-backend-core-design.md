# urlgram Backend Core — Design Spec

**Date:** 2026-04-25
**Scope:** Spec A of 3 (Backend Core). Specs B (frontend refactor) and C (SSE realtime) follow.

## 1. Goal

Build a Node + MongoDB HTTP API that persists user bookmarks, friend relationships, nested groups with admin-controlled folders, and chat URL-share history. No realtime push and no frontend changes are in scope for this spec.

## 2. Non-Goals (deferred)

- SSE / live chat push — Spec C.
- Plain-text chat persistence — out of scope (text is live-only in Spec C).
- Frontend integration — Spec B.
- Production deployment hardening — local Docker Mongo is the only target here.
- Push notifications, email, password reset, OAuth — not in this spec.

## 3. Architecture

A single Express service connects to MongoDB through Mongoose. Auth is stateless via JWT bearer tokens, with refresh tokens stored server-side for revocation. The service exposes one HTTP API surface; the browser extension is the only client and uses CORS-allowed origins (configured per environment).

```
[extension]  ──HTTPS──>  [Express API]  ──>  [MongoDB]
                              │
                              └── routes: /auth /bookmarks /friends /groups /chat
```

## 4. Tech Stack

- Node 20+
- Express 4
- Mongoose 8
- bcrypt (password hashing, 12 rounds)
- jsonwebtoken (HS256)
- Vitest + Supertest (tests)
- mongodb-memory-server (test DB)
- Docker Compose (local Mongo)

## 5. Data Model

All collections use Mongoose schemas. ObjectIds are referenced by `*Id` fields.

```
users         { _id, username (unique, lowercase), passwordHash, createdAt }

refreshTokens { _id, userId, tokenHash, expiresAt, revokedAt? }

bookmarks     { _id, ownerId, parentId | null, kind: 'folder'|'link',
                name, url?, platform?, createdAt }
              # one per-user tree. parentId nests freely.
              # kind='folder' is a container (no url). kind='link' has url.

friendships   { _id, requesterId, addresseeId, status: 'pending'|'accepted',
                createdAt }
              # unique compound index on (min(a,b), max(a,b)) to dedupe.

groups        { _id, parentGroupId | null, name, adminId, createdAt }
              # nestable group tree. adminId = creator initially.

groupFolders  { _id, groupId, parentFolderId | null, name, createdAt }
              # admin-only writes. members can read.

groupMembers  { _id, groupId, userId, role: 'admin'|'member', joinedAt }
              # creator gets a 'admin' row at create time.

joinRequests  { _id, groupId, userId, status: 'pending'|'approved'|'rejected',
                createdAt }

chatMessages  { _id, groupId, senderId, kind: 'url',
                url, title, platform, createdAt }
              # only URL shares persisted. text msgs are Spec C live-only.
```

Constraints enforced in code or via Mongoose validators:
- `bookmarks` and `groups` cannot be their own ancestor (cycle check on parent change).
- `bookmarks.parentId` must reference a `kind='folder'` owned by the same user.
- `groupFolders.parentFolderId` must belong to the same `groupId`.
- `groups.parentGroupId` must exist and creator must be a member of the parent (open question — see §11).
- `friendships` is symmetric: a single row represents the pair; lookups use `(requesterId, addresseeId)` or its reverse.

## 6. HTTP API

All request and response bodies are JSON. Authenticated routes require `Authorization: Bearer <accessToken>`.

### 6.1 Auth

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/auth/signup` | `{username, password}` | `{accessToken, refreshToken, user}` |
| POST | `/auth/login` | `{username, password}` | `{accessToken, refreshToken, user}` |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` (rotate) |
| POST | `/auth/logout` | `{refreshToken}` | `204` (revoke) |
| GET  | `/me` | — | `{user}` |

Username rules: 3–32 chars, `[a-z0-9_-]`, lowercased and unique-indexed.
Password rules: 8+ chars. No further policy in scope.

### 6.2 Bookmarks (own tree)

| Method | Path | Notes |
|--------|------|-------|
| GET    | `/bookmarks?parentId=<id|null>` | List children at given level. `null` (or missing) = root. |
| POST   | `/bookmarks` | `{parentId, kind, name, url?, platform?}`. Validates kind/url pairing. |
| PATCH  | `/bookmarks/:id` | `{name?, parentId?, url?, platform?}`. Cycle-check on parentId change. |
| DELETE | `/bookmarks/:id` | Folder delete cascades to descendants. |

### 6.3 Friends

| Method | Path | Notes |
|--------|------|-------|
| GET    | `/friends` | Accepted friend list. |
| GET    | `/friends/requests` | `{incoming: [...], outgoing: [...]}` for pending. |
| POST   | `/friends/request` | `{username}`. Creates `pending` friendship. 409 if already exists. |
| POST   | `/friends/:id/accept` | Receiver only; flips to `accepted`. |
| DELETE | `/friends/:id` | Either party; rejects pending or unfriends accepted. |
| GET    | `/users/:username/bookmarks?parentId=` | Friend's tree level. 403 if not accepted-friends. |

### 6.4 Groups

| Method | Path | Notes |
|--------|------|-------|
| GET    | `/groups` | Groups the caller is a member of. |
| POST   | `/groups` | `{parentGroupId?, name}`. Creator becomes admin + member. |
| GET    | `/groups/:id` | Members only. |
| GET    | `/groups/:id/children` | Subgroups. Members only. |
| POST   | `/groups/:id/join` | Creates `pending` joinRequest. 409 if pending or already member. |
| GET    | `/groups/:id/requests` | Admin only. Pending list. |
| POST   | `/groups/:id/requests/:reqId/approve` | Admin. Adds groupMember row. |
| DELETE | `/groups/:id/requests/:reqId` | Admin. Marks rejected. |
| GET    | `/groups/:id/members` | Members only. |
| DELETE | `/groups/:id/members/:userId` | Admin. Cannot kick self if sole admin. |

### 6.5 Group folders

| Method | Path | Notes |
|--------|------|-------|
| GET    | `/groups/:id/folders?parentFolderId=` | Members. |
| POST   | `/groups/:id/folders` | Admin only. `{parentFolderId?, name}`. |
| DELETE | `/groups/:id/folders/:fid` | Admin only. Cascades. |

### 6.6 Chat (URL share history)

| Method | Path | Notes |
|--------|------|-------|
| GET    | `/groups/:id/chat?before=<isoDate>&limit=<n≤100>` | Members. Newest-first paged. |
| POST   | `/groups/:id/chat` | Members. `{url, title, platform}`. Stores message; SSE broadcast hooked in Spec C. |

## 7. Auth & Authorization

- **Password storage:** bcrypt with cost factor 12.
- **Access token:** JWT HS256, 15-minute lifetime, payload `{sub: userId, username, iat, exp}`. Sent as `Authorization: Bearer <jwt>`.
- **Refresh token:** opaque random 32-byte base64url string. Server stores SHA-256 hash with `userId`, `expiresAt` (30d), and optional `revokedAt`. Rotated on every successful `/auth/refresh` (old row marked revoked, new row issued).
- **Logout:** revokes the supplied refresh token row.
- **Authorization middlewares:**
  - `requireAuth` — verifies access token, attaches `req.user`.
  - `requireFriendOf(:username)` — checks accepted friendship between caller and target user.
  - `requireGroupMember(:id)` — checks `groupMembers` row.
  - `requireGroupAdmin(:id)` — checks `role='admin'` row.

## 8. Error Format

All errors return:

```json
{ "error": { "code": "STRING_CODE", "message": "human readable" } }
```

Defined codes (HTTP status in parens):

- `AUTH_INVALID` (401) — bad creds, bad token.
- `AUTH_EXPIRED` (401) — access token expired.
- `FORBIDDEN` (403) — authz failed.
- `NOT_FOUND` (404).
- `CONFLICT` (409) — duplicate username, duplicate friend request, duplicate join.
- `VALIDATION` (400) — schema violation, bad parentId pairing, cycle.
- `RATE_LIMITED` (429) — auth endpoints only (see §10).
- `SERVER_ERROR` (500) — generic; no stack trace in body.

## 9. File Layout

```
backend/
  package.json
  .env.example
  docker-compose.yml         # local Mongo
  src/
    server.js                # express bootstrap, mounts routes
    db.js                    # mongoose connect helper
    config.js                # reads + validates env
    middleware/
      auth.js                # requireAuth + friend/group/admin gates
      error.js               # central error handler
      validate.js            # request body validation helper
    models/
      user.js
      bookmark.js
      friendship.js
      group.js
      groupFolder.js
      groupMember.js
      joinRequest.js
      chatMessage.js
      refreshToken.js
    routes/
      auth.js
      bookmarks.js
      friends.js
      groups.js
      chat.js
    services/
      tokens.js              # jwt sign/verify, refresh issue/rotate/revoke
      passwords.js           # bcrypt hash/compare
      tree.js                # ancestor walk + cycle check (bookmarks + groups)
  tests/
    helpers.js               # supertest app + memory mongo bootstrap
    auth.test.js
    bookmarks.test.js
    friends.test.js
    groups.test.js
    chat.test.js
    tree.test.js
```

## 10. Operational Concerns

- **Env vars** (`.env.example`):
  - `PORT` (default 4000)
  - `MONGO_URL` (default `mongodb://localhost:27017/urlgram`)
  - `JWT_SECRET` (required, min 32 chars)
  - `CORS_ORIGINS` (comma-separated; extension origin pattern goes here)
- **Rate limiting:** in-memory bucket on `/auth/login`, `/auth/signup`, `/auth/refresh` — 10/min per IP. Out of scope for non-auth routes.
- **Logging:** structured JSON to stdout. Request id per request. No password/token bodies logged.

## 11. Open Questions Carried Forward

These are flagged here so they aren't lost; they will be re-asked or assumed defaulted at plan time.

1. Subgroup creator membership in parent — must creator be a member of `parentGroupId`? Default: yes.
2. Folder cascade on group folder delete — also delete descendants? Default: yes.
3. Friend's bookmark visibility — full tree or only links (no folders)? Default: full tree.
4. Chat retention — keep URL shares forever, or N-day TTL? Default: keep forever.

## 12. Testing Strategy

Vitest + Supertest, fresh in-memory Mongo per test file.

Coverage target per route:
- One happy-path test.
- One auth-required negative test (missing/expired token).
- One authz negative test where applicable (non-friend, non-member, non-admin).
- One validation negative test (malformed body, bad ids).

Cross-cutting tests:
- Friendship visibility — A sees B's bookmarks only after accept.
- Group admin gating — non-admin POST/DELETE folder fails 403.
- Tree integrity — bookmark cycle prevention; group cycle prevention; cross-owner parentId rejected.
- Refresh token rotation — old token rejected after rotate; logout revokes.

## 13. Out of Scope (re-stated)

Friends/groups exist server-side; the **frontend** to drive them is Spec B. **SSE push** for chat and friend bookmark events is Spec C. Spec A is API + persistence only — verified by curl and by the test suite.
