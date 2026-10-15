import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { codexSelection, validateCodex } from "./windows-local-codex.mjs";
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
    CODEX_HOME: "wrong-home", CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "desktop", CODEX_SANDBOX_NETWORK_DISABLED: "1", CODEX_MANAGED_PACKAGE_ROOT: "wrong-package", CODEX_MANAGED_BY_BUN: "1",
    DATABASE_URL: "do-not-leak-db", PAPERCLIP_CONFIG: "vps-config", PAPERCLIP_API_KEY: "do-not-leak-task", PAPERCLIP_RUN_ID: "old-run",
    OPENAI_API_KEY: "do-not-leak-openai", ANTHROPIC_API_KEY: "do-not-leak-anthropic", CLAUDE_CODE_OAUTH_TOKEN: "do-not-leak-claude", NODE_OPTIONS: "--require unsafe" });
  for (const key of ["CODEX_HOME", "CODEX_INTERNAL_ORIGINATOR_OVERRIDE", "CODEX_SANDBOX_NETWORK_DISABLED", "CODEX_MANAGED_BY_BUN", "DATABASE_URL", "PAPERCLIP_API_KEY", "PAPERCLIP_RUN_ID", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "NODE_OPTIONS"]) assert.equal(env[key], undefined, key);
  assert.equal(env.PAPERCLIP_HOME, homeRoot);
  assert.equal(env.PAPERCLIP_DISABLE_CWD_ENV_FILE, "true");
  assert.equal(env.HOST, "127.0.0.1");
  assert.equal(env.SystemRoot, "C:\\Windows");
  assert.ok(env.PATH.includes(path.dirname(process.execPath)));
  const codex = codexSelection();
  assert.deepEqual(env.PATH.split(path.delimiter).slice(0, 2), codex.pathDirs);
  assert.equal(env.CODEX_MANAGED_PACKAGE_ROOT, codex.packageRoot);
  assert.equal(env.CODEX_MANAGED_BY_NPM, "1");
});

function toolFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-codex-test-"));
  t.after(() => {
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(relative.startsWith("paperclip-codex-test-") && !relative.includes(path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, "local-config"));
  const pin = path.join(root, "local-config", "windows-tools.json");
  fs.writeFileSync(pin, JSON.stringify({ codexVersion: "0.162.1" }));
  return { root, pin };
}

test("Codex selection is repo-local and rejects non-exact pins and unsupported architectures", (t) => {
  const { root, pin } = toolFixture(t);
  assert.ok(codexSelection(root, "x64").executable.startsWith(path.join(root, "data", "windows-tools") + path.sep));
  assert.equal(codexSelection(root, "arm64").triple, "aarch64-pc-windows-msvc");
  assert.throws(() => codexSelection(root, "ia32"), /architecture/);
  for (const version of ["latest", "^0.162.1", "0.162.1-alpha.1", "../outside"]) {
    fs.writeFileSync(pin, JSON.stringify({ codexVersion: version }));
    assert.throws(() => codexSelection(root, "x64"), /exact stable/);
  }
});

test("Codex startup validation rejects missing packages, version drift, layout drift and missing executables", (t) => {
  const { root } = toolFixture(t);
  const selection = codexSelection(root, "x64");
  assert.throws(() => validateCodex(selection), /windows-local-codex.mjs install/);
  fs.mkdirSync(selection.packageRoot, { recursive: true });
  for (const dir of [...selection.pathDirs, path.join(selection.nativeRoot, "codex-resources")]) fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(selection.packageRoot, "package.json");
  const manifestPath = path.join(selection.nativeRoot, "codex-package.json");
  const manifest = { layoutVersion: 1, version: selection.version, target: selection.triple, entrypoint: "bin/codex.exe", resourcesDir: "codex-resources", pathDir: "codex-path" };
  fs.writeFileSync(pkg, JSON.stringify({ name: "@openai/codex", version: selection.version }));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(selection.executable, "test fixture, never executed");
  assert.equal(validateCodex(selection), selection);
  fs.writeFileSync(pkg, JSON.stringify({ name: "@openai/codex", version: "0.157.1" }));
  assert.throws(() => validateCodex(selection), /does not match/);
  fs.writeFileSync(pkg, JSON.stringify({ name: "@openai/codex", version: selection.version }));
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, entrypoint: "../other.exe" }));
  assert.throws(() => validateCodex(selection), /does not match/);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.unlinkSync(selection.executable);
  assert.throws(() => validateCodex(selection), /missing or invalid/);
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
