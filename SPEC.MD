# TinyNotes — SPEC (Bun + TypeScript + Next.js + SQLite)

## 0) Goals and constraints

### Features

* Email+password authentication (better-auth).
* Authenticated users can create, view, edit, delete notes.
* Notes can be shared publicly via an unguessable link token.
* Share link can be disabled (revoked) by the note owner.
* Unauthenticated users can view shared notes via `/s/[token]`.

### Constraints

* Bun runtime, TypeScript, Next.js **App Router**, TailwindCSS.
* Rich text via TipTap. Stored as **TipTap JSON**; rendered as **sanitized HTML** for display.
* SQLite via **Bun’s built-in SQLite client**.
* No file storage, no images in notes.
* Raw SQL only (no ORM); custom migrations script.
* No password reset, no email confirmation, no outbound email sending.
* Minimal but **proper error handling** (no sensitive detail leakage).
* Custom **404 page**.
* Styling: “elegant acqua colors”.

---

## 1) Architecture overview

### Rendering and data access

* Use Next.js App Router.
* Use **React Server Components** for all note data reads.
* Use **Server Functions (Server Actions)** for all note mutations.
* Do not use client-side data fetching for initial note/page data (`useEffect() + fetch()` etc.).
* Client Components only for TipTap editor UI and minimal interactivity.

### Auth

* better-auth for:

  * Register / login via credentials (email+password).
  * Session management via secure cookie (httpOnly).
* App authorization:

  * Only owners can read/write their notes on authenticated routes.
  * Public shared route checks token and share status.

### Notes content pipeline

* Store:

  * `content_json` (TipTap JSON string).
* Render:

  * TipTap JSON → HTML on server.
  * **Sanitize** HTML (strict allowlist) before returning/serving to clients (especially public share view).

---

## 2) Routes (UI)

### Public

* `GET /` → if authenticated redirect to `/notes`, else redirect to `/login`.
* `GET /login` → login form.
* `GET /register` → registration form.
* `GET /s/[token]` → public shared note view (sanitized HTML).

### Authenticated

* `GET /notes` → list user’s notes (sorted by `updated_at DESC`).
* `GET /notes/new` → create note page (editor).
* `GET /notes/[id]` → view/edit note page (editor + share controls).

### Not found

* `app/not-found.tsx` custom 404 for missing pages/resources.

---

## 3) Server Functions (Server Actions)

Mutations are implemented as Server Actions invoked from forms and client interactions. Reads are done in Server Components by directly calling server-side data-access functions.

### Auth integration

* Use better-auth’s Next integration routes as required by the library. Only credential provider enabled.

### Notes actions (authenticated; require session)

* `createNoteAction(input: { title?: string; contentJson: object })`
* `updateNoteAction(input: { id: string; title?: string; contentJson?: object })`
* `deleteNoteAction(input: { id: string })`

All actions return typed result objects (success/error) and must not leak SQL/internal details in user-facing messages.

### Share actions (authenticated; require session)

* `enableShareAction(input: { id: string })` -> `{ shareUrl, token, shareEnabled: true }`
* `disableShareAction(input: { id: string })` -> `{ shareEnabled: false }`

### Public shared note read

* `/s/[token]` Server Component resolves token server-side and renders sanitized HTML.
* Invalid/disabled token or missing note must resolve to the same **404** behavior.

---

## 4) Data model (SQLite schemas)

### General conventions

* Use `TEXT` for IDs/tokens (UUID strings).
* Use `INTEGER` for booleans (0/1).
* Use `TEXT` ISO timestamps (UTC) or SQLite `strftime`-generated strings; choose one consistently. Recommended: `TEXT` ISO8601 UTC.

### better-auth required tables (from provided schema)

#### `user`

* `id TEXT PRIMARY KEY`
* `name TEXT NOT NULL`
* `email TEXT NOT NULL UNIQUE`
* `emailVerified INTEGER NOT NULL DEFAULT 0`
* `image TEXT NULL`
* `createdAt TEXT NOT NULL`
* `updatedAt TEXT NOT NULL`

#### `session`

* `id TEXT PRIMARY KEY`
* `userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`
* `token TEXT NOT NULL UNIQUE`
* `expiresAt TEXT NOT NULL`
* `ipAddress TEXT NULL`
* `userAgent TEXT NULL`
* `createdAt TEXT NOT NULL`
* `updatedAt TEXT NOT NULL`
* Index: `CREATE INDEX idx_session_userId ON session(userId);`

#### `account`

* `id TEXT PRIMARY KEY`
* `userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`
* `accountId TEXT NOT NULL`
* `providerId TEXT NOT NULL`
* `accessToken TEXT NULL`
* `refreshToken TEXT NULL`
* `accessTokenExpiresAt TEXT NULL`
* `refreshTokenExpiresAt TEXT NULL`
* `scope TEXT NULL`
* `idToken TEXT NULL`
* `password TEXT NULL`
* `createdAt TEXT NOT NULL`
* `updatedAt TEXT NOT NULL`
* Unique constraint for credentials:

  * `UNIQUE(providerId, accountId)`
* Index: `CREATE INDEX idx_account_userId ON account(userId);`

#### `verification`

* `id TEXT PRIMARY KEY`
* `identifier TEXT NOT NULL`
* `value TEXT NOT NULL`
* `expiresAt TEXT NOT NULL`
* `createdAt TEXT NOT NULL`
* `updatedAt TEXT NOT NULL`
* Index: `CREATE INDEX idx_verification_identifier ON verification(identifier);`

### TinyNotes tables

#### `note`

* `id TEXT PRIMARY KEY`
* `user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE`
* `title TEXT NOT NULL DEFAULT ''`
* `content_json TEXT NOT NULL` (serialized TipTap JSON)
* `share_enabled INTEGER NOT NULL DEFAULT 0`
* `created_at TEXT NOT NULL`
* `updated_at TEXT NOT NULL`
* Indexes:

  * `CREATE INDEX idx_note_user_updated ON note(user_id, updated_at DESC);`

#### `note_share`

Purpose: store public tokens separately, allow disable without deleting.

* `id TEXT PRIMARY KEY`
* `note_id TEXT NOT NULL REFERENCES note(id) ON DELETE CASCADE`
* `token_hash TEXT NOT NULL UNIQUE` (hash of token)
* `enabled INTEGER NOT NULL DEFAULT 1`
* `created_at TEXT NOT NULL`
* `disabled_at TEXT NULL`
* Constraints:

  * One active share per note (enforced via query logic; SQLite partial unique index optional).
* Index:

  * `CREATE INDEX idx_note_share_note ON note_share(note_id);`

#### `schema_migrations`

* `version TEXT PRIMARY KEY`
* `applied_at TEXT NOT NULL`

### Token hashing

* Generate token: 32 random bytes → base64url (no padding) or hex.
* Store `token_hash = SHA-256(token)` hex/base64.
* On lookup: hash incoming token and match.

---

## 5) SQL statements (raw)

### Notes

**List notes**

```sql
SELECT id, title, share_enabled, created_at, updated_at
FROM note
WHERE user_id = ?
ORDER BY updated_at DESC;
```

**Create note**

```sql
INSERT INTO note (id, user_id, title, content_json, share_enabled, created_at, updated_at)
VALUES (?, ?, ?, ?, 0, ?, ?);
```

**Get note by id (owner)**

```sql
SELECT id, user_id, title, content_json, share_enabled, created_at, updated_at
FROM note
WHERE id = ? AND user_id = ?;
```

**Update note (autosave)**

```sql
UPDATE note
SET title = COALESCE(?, title),
    content_json = COALESCE(?, content_json),
    updated_at = ?
WHERE id = ? AND user_id = ?;
```

**Delete note**

```sql
DELETE FROM note
WHERE id = ? AND user_id = ?;
```

### Sharing

**Enable share (create or re-enable)**

* Step 1: ensure note belongs to user.
* Step 2: find existing share row for note.

```sql
SELECT id, token_hash, enabled
FROM note_share
WHERE note_id = ?
ORDER BY created_at DESC
LIMIT 1;
```

* If none exists: insert.

```sql
INSERT INTO note_share (id, note_id, token_hash, enabled, created_at, disabled_at)
VALUES (?, ?, ?, 1, ?, NULL);
```

* If exists: re-enable.

```sql
UPDATE note_share
SET enabled = 1,
    disabled_at = NULL
WHERE id = ?;
```

* Update note flag:

```sql
UPDATE note SET share_enabled = 1, updated_at = ? WHERE id = ? AND user_id = ?;
```

**Disable share**

```sql
UPDATE note_share
SET enabled = 0,
    disabled_at = ?
WHERE note_id = ?;
```

```sql
UPDATE note SET share_enabled = 0, updated_at = ? WHERE id = ? AND user_id = ?;
```

**Public fetch by token**

```sql
SELECT n.title, n.content_json, n.updated_at
FROM note_share s
JOIN note n ON n.id = s.note_id
WHERE s.token_hash = ?
  AND s.enabled = 1
  AND n.share_enabled = 1
LIMIT 1;
```

* If no row: return 404.

---

## 6) TipTap editor specification

### Allowed features (default)

* TipTap `StarterKit`
* Links extension:

  * allow only `http`/`https`
  * `rel="noopener noreferrer"` and open in new tab

### Content storage

* Client sends TipTap JSON object.
* Server validates:

  * JSON parseable
  * size <= **256KB** serialized

### HTML rendering

* On server: TipTap JSON → HTML.
* Sanitize using strict allowlist (minimum):

  * tags: `p, br, strong, em, u, s, a, h1, h2, h3, ul, ol, li, blockquote, pre, code`
  * attributes: `a[href,target,rel]`
  * protocols: `http`, `https`
* Public `/s/[token]` must only ever serve sanitized HTML.

---

## 7) Autosave behavior

### Client

* On editor changes, debounce (e.g. 800–1200ms) and invoke `updateNoteAction`.
* Track “saving / saved / error” UI state.
* Avoid save storms:

  * do not send if content unchanged (compare serialized JSON hash).
  * cancel pending request on navigation/unmount if possible.

### Server

* Accept partial updates; update `updated_at`.
* Enforce payload size and ownership.
* Return updated timestamps and share state.

---

## 8) Error handling and security

### Error contract

* Server Actions should return:

  * `{ error: { code: string, message: string } }`
* `message` must be generic; no SQL details.
* Log full details server-side only (console is sufficient for demo).

Suggested `code` values:

* `UNAUTHORIZED` (401)
* `FORBIDDEN` (403)
* `NOT_FOUND` (404)
* `VALIDATION_ERROR` (400)
* `CONFLICT` (409)
* `RATE_LIMITED` (429, optional)
* `INTERNAL_ERROR` (500)

### Not leaking sensitive info

* Public shared note resolution always returns 404 for:

  * invalid token
  * disabled share
  * missing note
* Auth endpoints return generic invalid-credentials errors.

### Security headers (minimum)

* `Content-Security-Policy` (no inline scripts; allow self; allow style as needed by Next/Tailwind)
* `Referrer-Policy: no-referrer`
* `X-Content-Type-Options: nosniff`
* `X-Frame-Options: DENY` (or CSP frame-ancestors)
* `Permissions-Policy` minimal

### CSRF

* Rely on better-auth guidance for cookie sessions; ensure Server Actions require a valid session and use same-site cookies.

---

## 9) Styling (Tailwind, “elegant acqua colors”)

### Theme

* Add a small acqua palette via CSS variables (e.g. `--acc-1`, `--acc-2`) and map to Tailwind using `theme.extend.colors`.
* Use neutral background + acqua accents:

  * Buttons, links, focus rings, subtle gradients.
* Consistent components:

  * App shell, card, button, input, toast/banner for save/errors.

### Required pages UI states

* Loading states for note fetch and share fetch.
* Empty list state for `/notes`.
* Inline validation messages (generic).

---

## 10) Migrations

### Folder layout

* `migrations/0001_init.sql`, `0002_notes.sql`, etc.
* `scripts/migrate.ts`:

  * Ensures `schema_migrations` exists.
  * Reads migration files sorted by filename.
  * Applies each within a transaction.
  * Records applied version (filename) with timestamp.
  * On failure: rollback and exit non-zero.

### Migration content

* 0001: better-auth tables + indexes.
* 0002: `note`, `note_share`, indexes.

---

## 11) Environment variables

* `DB_PATH=./data/tinynotes.db`
* `AUTH_SECRET=...` (better-auth)
* `APP_URL=http://localhost:3000` (for share URL construction)
* Optional: `NODE_ENV`, `LOG_LEVEL`

---

## 12) Acceptance criteria (minimal)

1. Register + login works; session persists via cookie.
2. Auth user can create/edit/delete note; autosave reliably persists.
3. `/notes` shows notes sorted by last updated.
4. Enable share returns a link; `/s/[token]` shows sanitized rendered content without auth.
5. Disable share makes `/s/[token]` return 404.
6. Unauthorized access to `/notes/*` redirects to `/login`.
7. Custom 404 page shown for missing routes/resources.
8. Errors shown to user are generic; server logs contain details.
