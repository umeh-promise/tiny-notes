---
name: sqlite-explorer
description: Explore and query a local SQLite database safely and efficiently. Use to inspect schema, list tables/columns/indexes, and run arbitrary SQL queries (SELECT/INSERT/UPDATE/DELETE/DDL) with clear, readable output.
---

# SQLite DB Exploration

## Rules of engagement

- Default to **read-only** exploration (`SELECT`, schema queries).
- Only run **write queries** (INSERT/UPDATE/DELETE/DDL) when explicitly asked or clearly required.
- Always start by listing tables and inspecting schema before writing complex queries.
- Prefer parameterized queries when constructing SQL from user-provided values (if applicable).

## Use Bun script: `sqlite-explorer.ts`

You find a `sqlite-explorer.ts` script (which must be executed using Bun!) in [`${SKILL_DIR}/scripts/sqlite-explorer.ts`](scripts/sqlite-explorer.ts) that implements this skill. It accepts command-line arguments to specify the database path, query, and mode (read-only vs write).

### Usage

- List tables:
  `bun ${SKILL_DIR}/scripts/sqlite-explorer.ts ./path/to/db.sqlite --tables`

- Show schema for a table:
  `bun ${SKILL_DIR}/scripts/sqlite-explorer.ts ./path/to/db.sqlite --schema users`

- Run any SQL query:
  `bun sqlite-explorer.ts ./path/to/db.sqlite --query "SELECT * FROM users LIMIT 10"`

- Run a write query (only when needed):
  `bun ${SKILL_DIR}/scripts/sqlite-explorer.ts ./path/to/db.sqlite --query "UPDATE users SET active=1 WHERE id=42"`

- Read-only mode (recommended for exploration):
  `bun ${SKILL_DIR}/scripts/sqlite-explorer.ts ./path/to/db.sqlite --readonly --query "SELECT COUNT(*) FROM users"`

## Output expectations

- Tables: one per line
- Schema: columns + PK + FKs + indexes
- Query results: printed as a compact table; also prints affected row counts for non-SELECT

## Helpful built-in introspection SQL

- Tables: `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1;`
- Columns: `PRAGMA table_info('table_name');`
- Foreign keys: `PRAGMA foreign_key_list('table_name');`
- Indexes: `PRAGMA index_list('table_name');` + `PRAGMA index_info('index_name');`
- Rowcount: `SELECT COUNT(*) AS count FROM table_name;`
