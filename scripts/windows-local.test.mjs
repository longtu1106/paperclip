import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import {
  childEnvironment, validateConfig, matchingRecord, processAlive, portAvailable,
  repoRoot, homeRoot, instanceRoot, supportedNode,
} from "./windows-local.mjs";

function profile() {
  return {
    server: { deploymentMode: "local_trusted", host: "127.0.0.1", port: 3100, bind: "loopback", exposure: "private" },
    database: { mode: "embedded-postgres", embeddedPostgresDataDir: path.join(instanceRoot, "db"), embeddedPostgresPort: 54339, backup: { dir: path.join(instanceRoot, "data", "backups") } },
    storage: { localDisk: { baseDir: path.join(instanceRoot, "data", "storage") } },
    secrets: { localEncrypted: { keyFilePath: path.join(instanceRoot, "secrets", "master.key") } },
  };
}

test("Node baseline is 24.11, not every Node 24 release", () => {
  for (const v of ["22.20.0", "24.0.0", "24.10.9"]) assert.equal(supportedNode(v), false);
  for (const v of ["24.11.0", "v24.20.0", "25.0.0"]) assert.equal(supportedNode(v), true);
});

test("child process cannot inherit Desktop sandbox, SSH profile or provider credentials", () => {
  const env = childEnvironment({ PATH: "C:\\Windows", USERPROFILE: "C:\\Users\\tester", LOCALAPPDATA: "C:\\Users\\tester\\AppData\\Local", SystemRoot: "C:\\Windows",
    CODEX_HOME: "wrong-home", CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "desktop", CODEX_SANDBOX_NETWORK_DISABLED: "1",
    DATABASE_URL: "do-not-leak-db", PAPERCLIP_CONFIG: "vps-config", PAPERCLIP_API_KEY: "do-not-leak-task", PAPERCLIP_RUN_ID: "old-run",
    OPENAI_API_KEY: "do-not-leak-openai", ANTHROPIC_API_KEY: "do-not-leak-anthropic", CLAUDE_CODE_OAUTH_TOKEN: "do-not-leak-claude", NODE_OPTIONS: "--require unsafe" });
  for (const key of ["CODEX_HOME", "CODEX_INTERNAL_ORIGINATOR_OVERRIDE", "CODEX_SANDBOX_NETWORK_DISABLED", "DATABASE_URL", "PAPERCLIP_API_KEY", "PAPERCLIP_RUN_ID", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "NODE_OPTIONS"]) assert.equal(env[key], undefined, key);
  assert.equal(env.PAPERCLIP_HOME, homeRoot);
  assert.equal(env.PAPERCLIP_DISABLE_CWD_ENV_FILE, "true");
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.SystemRoot, "C:\\Windows");
  assert.ok(env.PATH.includes(path.dirname(process.execPath)));
});

test("profile refuses public bind and another database", () => {
  assert.equal(validateConfig(profile()).database.embeddedPostgresPort, 54339);
  for (const patch of [{ host: "0.0.0.0" }, { port: 13100 }, { deploymentMode: "authenticated" }, { bind: "lan" }, { exposure: "public" }]) {
    const config = profile(); Object.assign(config.server, patch);
    assert.throws(() => validateConfig(config));
  }
  const config = profile(); config.database.embeddedPostgresDataDir = path.join(repoRoot, "data", "paperclip-home", "instances", "default", "db");
  assert.throws(() => validateConfig(config));
});

test("profile cannot point secret key, storage or backup at another instance", () => {
  const config = profile(); config.secrets.localEncrypted.keyFilePath = path.join(repoRoot, "outside.key");
  assert.throws(() => validateConfig(config));
  const missing = profile(); delete missing.storage;
  assert.throws(() => validateConfig(missing));
});

test("stop records are bound to this source, instance and nonce", () => {
  const record = { repoRoot, homeRoot, port: 3100, pid: process.pid, nonce: "c13b156f-b576-49cf-983f-8a5bb4539872" };
  assert.equal(matchingRecord(record), true);
  for (const patch of [{ repoRoot: "C:/other" }, { homeRoot: "C:/other" }, { nonce: "bad" }, { port: 13100 }, { pid: "123" }]) assert.equal(matchingRecord({ ...record, ...patch }), false);
  assert.equal(processAlive(process.pid), true);
  assert.equal(processAlive(-1), false);
});

test("occupied port is detected without terminating its owner", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try { assert.equal(await portAvailable(port), false); assert.equal(server.listening, true); }
  finally { await new Promise((resolve) => server.close(resolve)); }
  assert.equal(await portAvailable(port), true);
});
