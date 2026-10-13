export type TestServer = { directory: string; dbPath: string; baseURL: string; port: number };

export function testServers(): TestServer[] {
  if (!process.env.TINYNOTES_E2E_SERVERS || !process.env.TINYNOTES_E2E_RUN)
    throw new Error("Run bun run test:e2e so tests receive isolated databases and servers.");
  return JSON.parse(process.env.TINYNOTES_E2E_SERVERS);
}
