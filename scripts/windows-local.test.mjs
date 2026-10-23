import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { installWindowsBackgroundChildren } from "./windows-background-children.mjs";
import { codexSelection, validateCodex } from "./windows-local-codex.mjs";
import {
  childEnvironment, validateConfig, matchingRecord, processAlive, portAvailable,
  repoRoot, homeRoot, instanceRoot, supportedNode,
} from "./windows-local.mjs";

test("background policy covers every child-process API and preserves callback/stdio/env", () => {
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"]) {
    let received;
    const marker = {};
    const target = { [name]: (...args) => { received = args; return marker; } };
    const original = target[name];
    assert.equal(installWindowsBackgroundChildren(target, "linux"), false);
    const restore = installWindowsBackgroundChildren(target, "win32");
    assert.equal(installWindowsBackgroundChildren(target, "win32"), false);
    const options = { windowsHide: false, timeout: 123, stdio: "pipe", env: { CUSTOM: "kept" } };
    const args = ["exec", "execSync"].includes(name) ? ["command", options] : ["command", ["arg"], options];
    assert.equal(target[name](...args), marker);
    const actual = received.at(-1);
    assert.equal(actual.windowsHide, true);
    assert.equal(actual.timeout, 123);
    assert.equal(actual.stdio, "pipe");
    assert.equal(actual.env.CUSTOM, "kept");
    assert.equal(actual.env.PAPERCLIP_WINDOWS_BACKGROUND_CHILDREN, "1");
    assert.match(actual.env.NODE_OPTIONS, /--import=file:/);
    assert.equal(options.windowsHide, false);
    assert.deepEqual(options.env, { CUSTOM: "kept" });
    if (["execFile", "exec"].includes(name)) {
      const callback = () => {};
      target[name]("command", callback);
      assert.equal(received[2], callback);
      assert.equal(received[1].windowsHide, true);
    }
    restore();
    assert.equal(target[name], original);
  }
});

test("background policy preserves promisified stdout/stderr and promise.child", async () => {
  const child = {};
  const original = (...args) => { queueMicrotask(() => args.at(-1)(null, "out", "err")); return child; };
  original[promisify.custom] = () => {};
  const target = { execFile: original };
  const restore = installWindowsBackgroundChildren(target, "win32");
  const promise = promisify(target.execFile)("command", ["arg"]);
  assert.equal(promise.child, child);
  assert.deepEqual(await promise, { stdout: "out", stderr: "err" });
  restore();
});

test("background policy preserves errors and undefined argument overloads", async () => {
  let received;
  const error = new Error("expected failure");
  const original = (...args) => {
    received = args;
    queueMicrotask(() => args.at(-1)(error, "partial", "diagnostic"));
    return {};
  };
  original[promisify.custom] = () => {};
  const target = { execFile: original };
  const restore = installWindowsBackgroundChildren(target, "win32");
  await assert.rejects(promisify(target.execFile)("command", undefined, { timeout: 50 }),
    cause => cause === error && cause.stdout === "partial" && cause.stderr === "diagnostic");
  assert.equal(received[2].timeout, 50);
  assert.equal(received[2].windowsHide, true);
  restore();
});

test("Node helpers inherit the background policy across two generations", () => {
  const policy = new URL("./windows-background-children.mjs", import.meta.url).href;
  const program = `
    const cp = await import('node:child_process');
    const {promisify} = await import('node:util');
    const {installWindowsBackgroundChildren} = await import(${JSON.stringify(policy)});
    installWindowsBackgroundChildren(cp.default, 'win32');
    const result = await promisify(cp.execFile)(process.execPath,
      ['-e', 'const cp = require("node:child_process"); process.stdout.write((process.env.PAPERCLIP_WINDOWS_BACKGROUND_CHILDREN || "missing") + ":" + (cp[Symbol.for("paperclip.windows-background-children")] === true))'],
      {encoding:'utf8', env:{...process.env}});
    process.stdout.write(JSON.stringify(result));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", program],
    { encoding: "utf8", windowsHide: true });
  assert.deepEqual(JSON.parse(output), { stdout: "1:true", stderr: "" });
});

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

test("server PATH exposes npm Claude's native executable without adopting credentials", (t) => {
  const npmRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-claude-path-"));
  t.after(() => {
    const relative = path.relative(os.tmpdir(), npmRoot);
    assert.ok(relative.startsWith("paperclip-claude-path-") && !relative.includes(path.sep));
    fs.rmSync(npmRoot, { recursive: true, force: true });
  });
  const nativeDir = path.join(npmRoot, "node_modules", "@anthropic-ai", "claude-code", "bin");
  fs.mkdirSync(nativeDir, { recursive: true });
  fs.writeFileSync(path.join(npmRoot, "claude.cmd"), "npm wrapper, not a native executable");
  assert.ok(!childEnvironment({ PATH: npmRoot }).PATH.split(path.delimiter).includes(nativeDir));
  fs.writeFileSync(path.join(nativeDir, "claude.exe"), "path fixture, never executed");
  const env = childEnvironment({ PATH: npmRoot, CLAUDE_CONFIG_DIR: "personal-auth", CLAUDE_CODE_OAUTH_TOKEN: "private-token" });
  assert.ok(env.PATH.split(path.delimiter).includes(nativeDir));
  const managedClaudeDir = path.join(repoRoot, "data", "windows-tools", "claude-code", "node_modules", "@anthropic-ai", "claude-code", "bin");
  if (fs.existsSync(path.join(managedClaudeDir, "claude.exe"))) {
    assert.ok(env.PATH.split(path.delimiter).indexOf(managedClaudeDir) < env.PATH.split(path.delimiter).indexOf(nativeDir));
  }
  assert.equal(env.CLAUDE_CONFIG_DIR, undefined);
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
  assert.deepEqual(env.PATH.split(path.delimiter).slice(0, 2), codexSelection().pathDirs);
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
  const alternate = profile(); alternate.database.embeddedPostgresPort = 15439;
  assert.equal(validateConfig(alternate).database.embeddedPostgresPort, 15439);
  for (const invalid of [0, 1023, 3100, 65536, 15439.5, "15439", null]) {
    const candidate = profile(); candidate.database.embeddedPostgresPort = invalid;
    assert.throws(() => validateConfig(candidate));
  }
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
