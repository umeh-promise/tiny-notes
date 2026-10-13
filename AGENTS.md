# Repository Guidelines

## General Instructions

- ALWAYS run `bun run format` AFTER you're done with your task and you edited all files that needed editing
- ALWAYS run `bun run lint` after making any changes => fix any linting errors you get
- ALWAYS check for type errors via `bun tsc --noEmit`

## Project Structure & Module Organization

This repository is a Next.js App Router project (TypeScript + Tailwind v4).

- `app/`: Route tree, layouts, and page entry points (for example `app/notes/page.tsx`).
- `src/components/`: Shared UI and layout building blocks (for example `src/components/layout/` and `src/components/ui/`).
- `public/`: Static assets served directly.
- Tests: colocated `*.test.ts(x)` unit tests, `*.integration.test.ts` SQLite integration tests, and `tests/e2e/` browser journeys.
- Root config: `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`.
- Product requirements/spec: `SPEC.MD`.

Keep route-level concerns in `app/` and reusable presentation components in `src/components/`.

## Build, Test, and Development Commands

Use Bun (lockfile is `bun.lock`), but npm equivalents also work.

- `bun run dev`: Start local dev server at `http://localhost:3000`.
- `bun run build`: Create a production build.
- `bun run start`: Run the production server.
- `bun run lint`: Run `oxlint` for static checks.
- `bun run format`: Run `oxfmt` to format code.

Run `bun run test`, `bun run test:e2e`, lint, and TypeScript checks before opening a PR.
The E2E command includes a production build.

## Testing Guidelines

- Use Vitest for unit and integration tests, invoked through `bun run test` (not `bun test`).
- Node 24 LTS >=24.15.0 runs jsdom/component tests; Bun runs SQLite integration tests.
- Use `bun run test:unit`, `bun run test:integration`, or `bun run test:watch` for focused work.
- Install browsers with `bunx playwright install chromium firefox webkit`.
- Use `bun run test:e2e --project chromium` for focused browser work; the default runs all projects.
- Always use the E2E launcher: it migrates a disposable database and owns its server. Never test against the local database.
- Deletion/sharing checks: `bun run test:e2e deletion.spec.ts sharing.spec.ts --project chromium`. The launcher supplies an ephemeral sharing key; never use real public links in fixtures.
- Assert intended behavior and persistence; cover failure paths. Use semantic locators, controlled clocks, and deterministic fixtures rather than arbitrary sleeps.
- Fix verified bugs with failing regression tests first. Do not skip failing cases or suppress unexpected errors.

## Coding Style & Naming Conventions

- Language: TypeScript (`.ts` / `.tsx`).
- Indentation: 2 spaces; keep lines readable and components focused.
- Components/files: use kebab-case file names (for example `placeholder-page.tsx`).
- Routes: follow App Router conventions (`page.tsx`, `layout.tsx`, dynamic segments like `[id]`).
- Prefer server components by default; use client components only when interactivity is required.

## Commit & Pull Request Guidelines

Recent commits use concise, imperative summaries (for example: `Scaffold TinyNotes base routes`).

- Commit messages: short subject line, verb-first, scoped to one logical change.
- PRs should include:
  - What changed and why.
  - Linked issue/spec section (`SPEC.MD` reference when relevant).
  - Screenshots/GIFs for UI-affecting changes.
  - Verification notes (commands run, e.g. `bun run lint`, `bun run build`).

## Security & Configuration Tips

- Do not commit secrets; use environment variables for sensitive values.
- Keep error messages generic in UI-facing code.
- Apply new migrations explicitly. Keep `SHARE_TOKEN_SECRET` stable and separate from the authentication secret; public tokens belong only in owner controls and share URLs, never logs.
- Validate changes against `SPEC.MD` before implementation.
