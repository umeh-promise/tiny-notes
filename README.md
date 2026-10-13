# TinyNotes

A Next.js App Router project using Bun, TypeScript, Tailwind CSS, and Better Auth.
Email/password registration, login, and sign-out use the existing SQLite schema in
[SPEC.MD](SPEC.MD). Authenticated users can create, edit, and browse private rich-text
notes, delete them, and publish or revoke read-only public links.

## Development

```sh
bun install --frozen-lockfile
# Create .env.local using .env.example; set AUTH_SECRET and SHARE_TOKEN_SECRET.
bun run db:migrate
bun run dev
```

Open [localhost:3000](http://localhost:3000). Use `bun run build` to create a production
build and `bun run start` to serve it.

Development and production builds use Webpack, with Bun as the runtime. This avoids
the Bun/Turbopack external-package resolution failure that can report a missing
`better-auth-<hash>` package on a fresh start ([upstream issue](https://github.com/vercel/next.js/issues/86866)).
After pulling a change to these scripts, stop the running development server and
restart it with `bun run dev`. Do not install the generated, hashed package name.

## Styling

Use Tailwind v4 utilities in TSX. Shared components live in `src/components`, including
the page container, buttons, typography, form fields, and error messages. Components
that accept `className` use `tailwind-merge` so caller utilities can override defaults.

`app/globals.css` defines theme tokens and base focus/tap behavior. Use theme utilities
such as `bg-aqua`, `text-muted`, and `font-display`; keep component styles and responsive
variants with their markup. The `md`, `lg`, and `2xl` breakpoints preserve the existing
design transitions at 761px, 1051px, and 1500px. Prefer flex for vertical/horizontal
stacks and grid for column layouts. Keep reduced-motion and keyboard-focus behavior
when changing interactive styles.

## Authentication

Configure these values in an ignored `.env.local` file; `.env.example` is the template:

- `AUTH_SECRET`: a stable random secret of at least 32 characters. Generate it with
  `openssl rand -base64 32`. Never commit it or change it on every startup.
- `APP_URL`: the browser-facing origin, defaulting to `http://localhost:3000`.
  Update it when using another port or domain. Use HTTPS in production; HTTPS origins
  receive Secure session cookies. Cookies are HttpOnly and SameSite=Lax.
- `DB_PATH`: the existing migrated database, defaulting to `./data/tinynotes.db`.
  Start Next.js from the repository root or supply an absolute database path.

The database and auth instance initialize lazily and are reused across development
reloads. Restart the server after changing environment variables. Startup and builds
never create tables or run migrations; initialize a new database explicitly.

Registration automatically signs users in. Authenticated users visiting `/`,
`/login`, or `/register` go to `/notes`; visitors retain the landing page. All notes
pages validate the database session before rendering, and sign-out ends the session.
Public share routes remain public. Sessions use Better Auth's default seven-day
lifetime; server-rendered reads do not refresh cookies. Browser API session reads
can refresh them using Better Auth's defaults. Passwords must have 8–128 characters.

There are no recovery, verification, email-sending, social-login, or account-management
flows. The API exposes only email sign-up/sign-in, sign-out, and session retrieval.
Better Auth retains its origin checks and built-in production rate limits (in memory,
per process). Forms require JavaScript and show safe validation and connection errors.

Two intentional clarifications to `SPEC.MD`: the public landing page remains visible
to visitors, and Better Auth's supported Bun adapter uses Kysely internally. Application
queries and migrations remain raw SQL; there is no application ORM or custom auth adapter.

## Notes and editing

`/notes` shows only your notes, newest edits first, in pages of 24. Ties use descending
note IDs. Cards show escaped plain-text previews. `/notes/new` starts an unsaved draft;
`/notes/[id]` opens your saved note. Missing notes and notes belonging to another user
show the same not-found state.

The Tiptap editor supports headings 1–3, emphasis, underline, strikethrough, lists,
quotes, inline code, code blocks, HTTP/HTTPS links, and undo/redo. Images and uploads
are not supported. Creating or saving edits requires a nonblank title; the body is optional. Titles
are limited to 200 characters and serialized document JSON to 256 KB (UTF-8).
Older blank notes remain readable, with **Untitled note** as a display fallback,
but a title must be supplied before saving edits, including partial updates.

- **Save** persists a draft and replaces its URL with the saved note's address.
- Existing notes autosave after 1,000 ms of inactivity. New drafts need Save or Submit.
- **Submit** saves the latest changes before returning to the list.
- **Clear** asks for confirmation, empties only the body, and can be undone. An
  empty body can be saved and autosaves when the title is valid.
- Required fields have visible labels and accessible inline errors. Submit also
  works by pressing Enter in the title. Delete, Clear, and Submit share the footer.
- Editor exits and sign-out wait for a successful save. Completely empty drafts
  can leave without saving or a reload/Back warning. Body text with no title
  requires a title before saving or using All notes. Reloading or closing the tab
  warns about other unsaved changes. Drafts are held in memory, not local storage.
- Failed saves keep your text and offer Retry save. A concurrent update pauses
  autosaving; copy any local text you want to retain before confirming Open saved version.
- If a save response is lost, retry acknowledges that exact write before saving newer
  edits. This avoids duplicate notes and false conflicts after connection failures.

Server Components perform owner-scoped reads. Authenticated Server Actions validate
documents against the shared editor schema and use parameterized SQL. Writes use
immediate transactions, stable draft UUIDs for creation retries, and `updated_at` for
optimistic concurrency. The notes connection is lazy and separate from Better Auth's
connection; neither creates tables. Successful writes revalidate affected routes while
the editor preserves its local document and serializes pending saves.

## Deletion and public sharing

Delete is available on note cards and in saved-note editors. Confirmation permanently
removes the note and all its shares; there is no undo. Deleting pauses queued saves
and settles an outstanding write without saving remaining dirty text first. Failed
requests retain the editor and offer retry. A minimal deletion record (ID, owner,
and time only) prevents a delayed creation retry from recreating the note.

Saved editors provide **Share note**, **Copy link**, and **Unshare**. Sharing first saves
the current document; save failures prevent publication. Unsharing remains available
when local edits conflict or cannot be saved. Anyone with the URL can read the latest
saved version at `/s/[token]` without an account. Unsharing or deleting returns a 404
on subsequent requests; it cannot erase copies a reader has already obtained.

Active links can be copied again after reloading. Re-sharing always issues a new
random token, so old links stay revoked. Sharing uses its own precondition to reject
stale changes from other tabs. **Refresh sharing details** updates access information
without replacing unsaved text. Clipboard failures offer manual selection/copying.

Set `SHARE_TOKEN_SECRET` to a stable 32-byte base64url key, separate from `AUTH_SECRET`:

```sh
bun -e 'console.log(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"))'
```

Store the generated value in ignored `.env.local` (or the production secret manager)
and restart the server. Tokens are hashed for public lookup and encrypted with
AES-256-GCM for owner recovery; they are never stored as plaintext in SQLite.
Losing/changing the key prevents recovery of existing URLs, but their public lookup
and revocation still work. Legacy hash-only shares behave the same way: unshare and
share again to obtain a recoverable link. Back up the key securely with the database.

Public pages render validated Tiptap JSON on the server and sanitize the HTML with a
strict allowlist. They have no editor, use a nonce-based CSP, prohibit framing,
suppress referrers, and request no caching or indexing. Invalid, revoked, and deleted
links return the same illustrated unavailable page with HTTP 404. Its boundary lives
above the access-check layout so revoked links cannot fall through to the root 404.
Public tokens and note contents must not be
included in application logs; configure any deployment access logs accordingly.

Clarifications to the spec's example SQL: each re-share creates a fresh token; share
changes do not change `updated_at` or list order, which track content edits. Encrypted
token recovery and deletion retry records extend the original schema through new
migrations. No sharing or deletion operation bypasses session/ownership checks.

## Database migrations

The runner uses Bun's built-in `bun:sqlite` client and raw SQL. Run it explicitly;
development, build, and application startup do not run migrations automatically.

```sh
bun run db:migrate          # Apply all pending UP migrations
bun run db:migrate up       # Same behavior, explicitly
bun run db:migrate down     # Revert only the latest applied migration
```

`DB_PATH` defaults to `./data/tinynotes.db`. Relative paths are resolved against the
repository root, regardless of the working directory. Missing parent directories
are created automatically. To select another database:

```sh
DB_PATH=/absolute/path/tinynotes.db bun run db:migrate
```

Migration 0001 creates the authentication tables specified in `SPEC.MD`; migration
0002 creates notes and sharing tables. Migration 0003 adds deletion retry records;
0004 adds encrypted share-token storage. Each UP or DOWN migration runs in its own
immediate transaction with its history update. A failure rolls back that migration,
stops the command, and exits nonzero; earlier successful migrations remain applied.
Repeated UP runs skip applied migrations. DOWN with no applied migrations is a no-op.

DOWN reverts **one migration** per invocation. Reverting 0004 drops encrypted token
copies but leaves hashes and active links intact; those URLs cannot be recovered
again after reapplying UP. Reverting 0003 drops deletion retry records, not deleted
notes. Reverting 0002 removes notes/shares and their data; 0001 removes authentication
data. Back up valuable data before reverting, and deploy code compatible with the
remaining schema. UP recreates schema but does not recover removed data. The
`schema_migrations` table remains after every application migration is reversed.

Connections enable foreign keys, WAL, and a five-second busy timeout. SQLite may
retain `-wal` and `-shm` sidecar files, especially on macOS; do not delete these
manually from a live database. Database and sidecar files are ignored by Git.

### Adding a migration

Add a pair such as `migrations/0005_example.up.sql` and
`migrations/0005_example.down.sql`. Use a unique four-digit number greater than all
existing migration numbers and a lowercase underscore-separated name. Files are
applied in filename order; DOWN executes the latest applied version's paired file.

- Write the reverse operation in the DOWN file, respecting foreign-key dependencies.
- Let the runner manage transactions and history: do not include `BEGIN`, `COMMIT`,
  `ROLLBACK`, savepoint control, or edits to `schema_migrations` in migration SQL.
- Keep SQL compatible with a transaction; do not include commands such as `VACUUM`.
- Never edit, rename, or remove migrations already applied to a shared database.
  Add a new pair instead. History records filenames, not content checksums.
- Missing pairs, duplicate numbers, and history that is not an ordered prefix of
  the available migrations are rejected.

## Testing and verification

Use Bun for package management and the application runtime. Test tooling also requires
**Node 24 LTS >=24.15.0 on PATH** (`node --version`): the installed jsdom cannot run
under Bun. No additional testing libraries are needed.

```sh
bun install --frozen-lockfile
bunx playwright install chromium firefox webkit
# Linux CI also needs browser system dependencies:
# bunx playwright install --with-deps chromium firefox webkit

bun run test                 # Vitest unit + integration projects
bun run test:unit            # Node: React Testing Library/jsdom + pure logic
bun run test:integration     # Bun: actual SQLite, Better Auth, and migrations
bun run test:watch           # Unit tests in watch mode
bun run test:e2e             # Build, then all desktop and focused mobile projects
bun run test:all             # All Vitest and Playwright tests

bun run test:unit --reporter=verbose
bun run test:e2e --project chromium
bun run test:e2e recovery.spec.ts --project firefox
bun run test:e2e --project chromium --ui
bunx playwright show-report

bun run format
bun run lint
bun tsc --noEmit
```

Vitest unit tests are colocated as `*.test.ts` / `*.test.tsx`; database tests use
`*.integration.test.ts`. Run the package scripts, **not `bun test`**. The integration
project uses Vitest under Bun with forked workers and real disposable SQLite databases.
Only Next's `server-only` import marker is mocked; React's `react-server` condition is
not applied globally. Component tests use real React with mocked network boundaries;
async Server Components and the real Tiptap editor are exercised in Playwright.

The E2E launcher creates a fresh temporary database per worker, applies the checked-in
migrations, generates ephemeral authentication and sharing secrets, builds once with Webpack, and starts an
isolated production Bun server for each worker.
It overrides `DB_PATH`, `AUTH_SECRET`, `SHARE_TOKEN_SECRET`, and `APP_URL` for that run. It never uses the local
application database or reuses an existing server. The default port is 3100; override
the starting port with `E2E_PORT=3200 bun run test:e2e`. Two workers use consecutive
ports by default (one in CI); set `E2E_WORKERS=1` to change the pool size. Each worker
owns a database so failure-injection triggers cannot disrupt another test's transaction.
Use `E2E_WORKERS` rather than increasing Playwright's `--workers` argument.
Run browser tests through this launcher rather
than invoking `playwright test` directly. Every invocation builds current source.

Browser tests use unique accounts and client-IP buckets so production rate limits stay
enabled without interference between tests. Fixture SQL runs in a Bun subprocess that
checks the launcher's temporary-directory marker. Processes and databases are cleaned up
on completion or interruption. Traces and screenshots for failed tests remain in ignored
`test-results/`; the HTML report is in `playwright-report/`. To view a trace, run
`bunx playwright show-trace test-results/<failed-test>/trace.zip`. Artifacts contain only
disposable test data, but may include those temporary account credentials.

The suite covers authentication, protected routes, persistence, formatting, ownership,
pagination, validation, migrations, rollback, save queues, autosave timing, offline and
lost-response recovery, expired sessions, two-tab conflicts, and guarded navigation.
Chromium, Firefox, and WebKit run desktop journeys; mobile Chrome and Safari run focused
registration/editor/navigation checks. Tests fail on unexpected browser exceptions,
hydration failures, unhandled Vitest errors, and focused tests in CI. CI allows one
browser retry for diagnosis but still fails if a test is flaky. The error collector
records the known [WebKit prefetch cancellation diagnostic](https://github.com/microsoft/playwright/issues/42823)
as a report annotation only when it concerns a same-origin RSC URL during hard
navigation. Ordinary API errors, errors on active pages, and other browser exceptions
still fail. Teardown fetches can be refused before the browser emits a request event.

Prefer semantic role/label locators, controlled clocks and responses, and assertions
against reloads or persisted data. Add a failing regression test before fixing a defect.
Do not replace real SQL/editor behavior with mocks, weaken assertions to match bugs, or
use arbitrary sleeps. Deletion and sharing tests also cover late saves, cascades,
revocation, concurrent/stale requests, encrypted recovery, sanitized public rendering,
security headers, and failures that must preserve local text.
