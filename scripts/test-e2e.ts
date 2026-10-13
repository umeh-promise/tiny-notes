import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runMigrations } from "./migrate";
import type { TestServer } from "../tests/e2e/support/environment";

const root = resolve(import.meta.dirname, "..");
const node = Bun.which("node");
if (!node) throw new Error("Install Node 24 LTS >=24.15.0 for Playwright tooling.");
const version = Bun.spawnSync([node, "-p", "process.versions.node"]);
const [major, minor] = version.stdout.toString().trim().split(".").map(Number);
if (major !== 24 || minor < 15)
  throw new Error("Put Node 24 LTS >=24.15.0 on PATH before running the test commands.");
const port = Number(process.env.E2E_PORT ?? 3100);
const workers = Number(process.env.E2E_WORKERS ?? (process.env.CI ? 1 : 2));
if (!Number.isInteger(workers) || workers < 1 || workers > 8)
  throw new Error("E2E_WORKERS must be an integer between 1 and 8.");
if (!Number.isInteger(port) || port < 1024 || port + workers > 65536)
  throw new Error("E2E_PORT must leave room for E2E_WORKERS ports between 1024 and 65535.");
const directory = mkdtempSync(join(tmpdir(), "tinynotes-e2e-"));
const servers: TestServer[] = Array.from({ length: workers }, (_, index) => ({
  directory: join(directory, String(index)),
  dbPath: join(directory, String(index), "test.db"),
  baseURL: `http://127.0.0.1:${port + index}`,
  port: port + index,
}));
const runId = crypto.randomUUID();
const env = {
  ...process.env,
  NODE_ENV: "production",
  DB_PATH: servers[0].dbPath,
  AUTH_SECRET: crypto.randomUUID() + crypto.randomUUID(),
  SHARE_TOKEN_SECRET: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
  APP_URL: servers[0].baseURL,
  E2E_PORT: String(port),
  TINYNOTES_E2E_DIR: directory,
  TINYNOTES_E2E_RUN: runId,
  TINYNOTES_E2E_SERVERS: JSON.stringify(servers),
};
let child: ReturnType<typeof Bun.spawn> | undefined;
let interrupted = false;
function stop() {
  interrupted = true;
  child?.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function run(command: string[]) {
  if (interrupted) return 130;
  child = Bun.spawn(command, {
    cwd: root,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  child = undefined;
  return interrupted ? 130 : code;
}
try {
  for (const server of servers) {
    mkdirSync(server.directory);
    await Bun.write(
      join(server.directory, "run.json"),
      JSON.stringify({ runId, dbPath: server.dbPath }),
    );
    runMigrations({ dbPath: server.dbPath, log: () => {} });
  }
  console.log(`Building TinyNotes with ${workers} isolated browser-test databases and servers.`);
  const built = await run([process.execPath, "run", "build"]);
  process.exitCode =
    built ||
    (await run([node, "node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)]));
} finally {
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  rmSync(directory, { recursive: true, force: true });
}
