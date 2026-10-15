import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const homeRoot = path.join(repoRoot, "data", "windows-home");
export const instanceRoot = path.join(homeRoot, "instances", "default");
export const configPath = path.join(instanceRoot, "config.json");
export const runtimeRoot = path.join(homeRoot, "windows-runtime");
export const lockPath = path.join(runtimeRoot, "server.json");
export const stopPath = path.join(runtimeRoot, "stop.json");
export const backupRoot = path.join(repoRoot, "data", "windows-backups");
export const serverEntry = path.join(repoRoot, "scripts", "windows-local-server.mjs");
export const tsxLoader = path.join(repoRoot, "server", "node_modules", "tsx", "dist", "loader.mjs");
const port = 3100;
const databasePort = 54339;

export function supportedNode(version) {
  const [major, minor] = version.replace(/^v/, "").split(".").map(Number);
  return major > 24 || (major === 24 && minor >= 11);
}

export function sourceHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8", windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
}

export function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function matchingRecord(record) {
  return record?.repoRoot === repoRoot && record?.homeRoot === homeRoot &&
    record?.port === port && Number.isInteger(record?.pid) &&
    typeof record?.nonce === "string" && /^[a-f0-9-]{36}$/.test(record.nonce);
}

export function validateConfig(config) {
  if (config?.server?.deploymentMode !== "local_trusted" ||
      config.server.host !== "127.0.0.1" || config.server.port !== port ||
      config.server.bind !== "loopback" || config.server.exposure !== "private" ||
      config.database?.mode !== "embedded-postgres" ||
      path.resolve(config.database.embeddedPostgresDataDir ?? "") !== path.join(instanceRoot, "db") ||
      config.database.embeddedPostgresPort !== databasePort) {
    throw new Error("Windows profile must use its own embedded DB and local-only listener. Edit deployment separately for remote access.");
  }
  for (const target of [config.storage?.localDisk?.baseDir, config.secrets?.localEncrypted?.keyFilePath, config.database?.backup?.dir]) {
    const relative = typeof target === "string" ? path.relative(instanceRoot, target) : "..";
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Windows profile storage, secrets and backups must stay inside its instance root.");
    }
  }
  return config;
}

export function setup() {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  if (!fs.existsSync(configPath)) {
    // Never adopt an unconfigured database (including a copied VPS volume).
    if (fs.existsSync(path.join(instanceRoot, "db", "PG_VERSION"))) {
      throw new Error("Existing database without Windows config; restore/configure it explicitly first.");
    }
    writeJson(configPath, {
      $meta: { version: 1, updatedAt: new Date().toISOString(), source: "configure" },
      database: {
        mode: "embedded-postgres", embeddedPostgresDataDir: path.join(instanceRoot, "db"),
        embeddedPostgresPort: databasePort,
        backup: { enabled: true, intervalMinutes: 60, retentionDays: 7, dir: path.join(instanceRoot, "data", "backups") },
      },
      logging: { mode: "file", logDir: path.join(instanceRoot, "logs") },
      server: { deploymentMode: "local_trusted", exposure: "private", bind: "loopback", host: "127.0.0.1", port, allowedHostnames: ["localhost", "127.0.0.1"], serveUi: true },
      auth: { baseUrlMode: "auto", disableSignUp: false },
      storage: { provider: "local_disk", localDisk: { baseDir: path.join(instanceRoot, "data", "storage") } },
      secrets: { provider: "local_encrypted", strictMode: false, localEncrypted: { keyFilePath: path.join(instanceRoot, "secrets", "master.key") } },
      telemetry: { enabled: false },
    });
  }
  validateConfig(readJson(configPath));
  const envPath = path.join(instanceRoot, ".env");
  if (!fs.existsSync(envPath)) {
    fs.writeFileSync(envPath,
      `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\nPAPERCLIP_TOOL_ACTION_SIGNING_SECRET=${randomBytes(32).toString("hex")}\n`,
      { flag: "wx", mode: 0o600 });
  }
  return { url: `http://localhost:${port}`, homeRoot, configPath };
}

export function childEnvironment(input = process.env) {
  // A Desktop session's pipe/sandbox, cloud credentials and SSH wrapper must
  // never leak into this separate server. Agent connections live in its vault.
  const allowed = /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|SYSTEMDRIVE|COMSPEC|TEMP|TMP|USERPROFILE|USERNAME|USERDOMAIN|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|PROGRAMW6432|PUBLIC|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|LANG|LC_ALL)$/i;
  const env = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.test(key)));
  env.PATH = env.Path ?? env.PATH ?? "";
  delete env.Path;
  env.PATH = [path.dirname(process.execPath), path.join(input.USERPROFILE ?? "", ".local", "bin"), path.join(input.LOCALAPPDATA ?? "", "Programs", "OpenAI", "Codex", "bin"), env.PATH].join(path.delimiter);
  Object.assign(env, {
    PAPERCLIP_HOME: homeRoot, PAPERCLIP_INSTANCE_ID: "default", PAPERCLIP_CONFIG: configPath,
    PAPERCLIP_DISABLE_CWD_ENV_FILE: "true",
    PAPERCLIP_DEPLOYMENT_MODE: "local_trusted", PAPERCLIP_DEPLOYMENT_EXPOSURE: "private",
    PAPERCLIP_BIND: "loopback", HOST: "127.0.0.1", PORT: String(port),
    PAPERCLIP_UI_DEV_MIDDLEWARE: "true", SERVE_UI: "true",
    PAPERCLIP_MIGRATION_PROMPT: "never", PAPERCLIP_MIGRATION_AUTO_APPLY: "true",
    // Start in maintenance mode until migration/routing is verified.
    HEARTBEAT_SCHEDULER_ENABLED: readJson(path.join(runtimeRoot, "execution.json"))?.enabled === true ? "true" : "false",
    CLAUDE_CODE_GIT_BASH_PATH: "C:\\Program Files\\Git\\bin\\bash.exe",
    NODE_ENV: "development",
  });
  return env;
}

export async function portAvailable(targetPort = port) {
  return await new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(targetPort, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

export function claimServer() {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const record = { pid: process.pid, nonce: randomUUID(), repoRoot, homeRoot, port, startedAt: new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = fs.openSync(lockPath, "wx", 0o600);
      try { fs.writeFileSync(handle, JSON.stringify(record)); } finally { fs.closeSync(handle); }
      return record;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const old = readJson(lockPath);
      if (!matchingRecord(old) || processAlive(old.pid)) throw new Error("Windows server is already running, or its lock requires inspection.");
      fs.unlinkSync(lockPath);
    }
  }
  throw new Error("Unable to claim Windows server lock.");
}

export function releaseServer(record) {
  const current = readJson(lockPath);
  if (current?.nonce === record.nonce && current?.pid === record.pid) fs.unlinkSync(lockPath);
  if (readJson(stopPath)?.nonce === record.nonce) fs.unlinkSync(stopPath);
}

async function withOperationLock(operation) {
  fs.mkdirSync(runtimeRoot, { recursive: true });
  const file = path.join(runtimeRoot, "operation.json");
  const record = { pid: process.pid, nonce: randomUUID(), repoRoot, homeRoot, port };
  for (let index = 0; index < 2; index++) {
    let handle;
    try { handle = fs.openSync(file, "wx", 0o600); }
    catch (error) {
      if (error.code !== "EEXIST") throw error;
      const owner = readJson(file);
      if (!matchingRecord(owner) || processAlive(owner.pid)) throw new Error("Another Windows start/backup operation is in progress.");
      fs.unlinkSync(file); continue;
    }
    try {
      fs.writeFileSync(handle, JSON.stringify(record));
      fs.closeSync(handle); handle = undefined;
      return await operation();
    } finally {
      if (handle !== undefined) fs.closeSync(handle);
      if (readJson(file)?.nonce === record.nonce) fs.unlinkSync(file);
    }
  }
  throw new Error("Unable to lock Windows start/backup operation.");
}

export async function status() {
  const record = readJson(lockPath);
  const running = matchingRecord(record) && processAlive(record.pid);
  let health = null;
  if (running) {
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (result.ok) { const body = await result.json(); health = { status: body.status, deploymentMode: body.deploymentMode, localAiLoginSupported: body.localAiLoginSupported }; }
    } catch { /* A starting/stopping server is not ready. */ }
  }
  return { running, pid: running ? record.pid : null, url: `http://localhost:${port}`, homeRoot, executionEnabled: readJson(path.join(runtimeRoot, "execution.json"))?.enabled === true, health };
}

export async function start() {
  return await withOperationLock(startLocked);
}

async function startLocked() {
  if (!supportedNode(process.versions.node)) throw new Error("Node 24.11 or newer is required.");
  setup();
  const before = await status();
  if (before.running) return before;
  if (!await portAvailable() || !await portAvailable(databasePort)) throw new Error("HTTP or database port is occupied; no process was stopped.");
  if (!fs.existsSync(tsxLoader)) throw new Error("Install the repo dependencies first.");
  let preStartupBackup;
  const head = sourceHead();
  if (fs.existsSync(path.join(instanceRoot, "db", "PG_VERSION")) &&
      readJson(path.join(runtimeRoot, "last-start.json"))?.sourceHead !== head) {
    preStartupBackup = (await copyOfflineInstance()).backup;
  }
  const out = fs.openSync(path.join(runtimeRoot, "server-out.log"), "a", 0o600);
  const err = fs.openSync(path.join(runtimeRoot, "server-error.log"), "a", 0o600);
  try {
    const child = spawn(process.execPath, ["--import", pathToFileURL(tsxLoader).href, serverEntry], {
      cwd: repoRoot, env: childEnvironment(), detached: true, windowsHide: true,
      stdio: ["ignore", out, err],
    });
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    // Keep the operation lock until the child owns the server lock. Otherwise a
    // concurrent start could copy the DB while the first child is opening it.
    for (let index = 0; index < 100; index++) {
      const owner = readJson(lockPath);
      if (matchingRecord(owner) && owner.pid === child.pid) break;
      if (!processAlive(child.pid)) throw new Error("Windows server exited during startup; inspect its private logs.");
      if (index === 99) throw new Error("Windows server has not claimed its lock; inspect status before retrying.");
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally { fs.closeSync(out); fs.closeSync(err); }
  return { starting: true, url: `http://localhost:${port}`, logs: runtimeRoot, ...(preStartupBackup ? { preStartupBackup } : {}) };
}

export async function stop() {
  const record = readJson(lockPath);
  if (!record) return { stopped: true, alreadyStopped: true };
  if (!matchingRecord(record)) throw new Error("Refusing to stop a server with an unknown identity.");
  if (!processAlive(record.pid)) { releaseServer(record); return { stopped: true, staleLockRemoved: true }; }
  writeJson(stopPath, { nonce: record.nonce, pid: record.pid });
  for (let index = 0; index < 55; index++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (!processAlive(record.pid)) return { stopped: true };
  }
  throw new Error("Graceful stop is still pending; inspect status/logs. No force-kill was issued.");
}

export async function backup() {
  return await withOperationLock(copyOfflineInstance);
}

async function copyOfflineInstance() {
  if ((await status()).running || !await portAvailable(databasePort)) throw new Error("Stop the Windows instance before its complete filesystem backup.");
  if (!fs.existsSync(configPath)) throw new Error("No Windows instance to back up.");
  const destination = path.join(backupRoot, new Date().toISOString().replace(/[:.]/g, "-") + "-" + randomBytes(3).toString("hex"));
  const relative = path.relative(backupRoot, destination);
  if (relative.startsWith("..") || path.isAbsolute(relative) || destination.startsWith(instanceRoot + path.sep)) throw new Error("Invalid backup target.");
  fs.mkdirSync(destination, { recursive: true });
  fs.cpSync(instanceRoot, path.join(destination, "instance"), { recursive: true, dereference: false, errorOnExist: true, force: false });
  writeJson(path.join(destination, "manifest.json"), { format: "paperclip-windows-offline-v1", createdAt: new Date().toISOString(), repoRoot, homeRoot, platform: process.platform, sourceHead: sourceHead() });
  return { backup: destination, includes: "database, config, storage, agent files and secret key; Windows instance only" };
}

export async function main(args = process.argv.slice(2)) {
  if (process.platform !== "win32") throw new Error("This profile is for native Windows only.");
  const [action = "status", value] = args;
  if (args.length > 2) throw new Error("Unexpected arguments.");
  if (value !== undefined && action !== "execution") throw new Error("Unexpected argument for this action.");
  if (action === "setup") return setup();
  if (action === "start") return await start();
  if (action === "stop") return await stop();
  if (action === "status") return await status();
  if (action === "backup") return await backup();
  if (action === "execution" && ["on", "off"].includes(value)) {
    if ((await status()).running) throw new Error("Stop the Windows server before changing execution mode.");
    setup(); writeJson(path.join(runtimeRoot, "execution.json"), { enabled: value === "on" });
    return { executionEnabled: value === "on", restartRequired: true };
  }
  if (action === "doctor") {
    const env = childEnvironment();
    const cli = Object.fromEntries(["codex.exe", "claude.exe", "git.exe"].map((command) => {
      const result = spawnSync(command, ["--version"], { env, timeout: 10000, encoding: "utf8", windowsHide: true });
      return [command, { available: result.status === 0, version: result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : null }];
    }));
    return { platform: process.platform, node: process.version, nodeSupported: supportedNode(process.versions.node), cli,
      tsxInstalled: fs.existsSync(tsxLoader), configPresent: fs.existsSync(configPath),
      configValid: fs.existsSync(configPath) ? !!validateConfig(readJson(configPath)) : false,
      httpPortFree: await portAvailable(), databasePortFree: await portAvailable(databasePort),
      sourceBranch: spawnSync("git", ["branch", "--show-current"], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).stdout?.trim(),
      sourceChanges: spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8", windowsHide: true }).stdout?.split(/\r?\n/).filter(Boolean).length,
      ...await status() };
  }
  throw new Error("Use setup | start | stop | status | doctor | backup | execution on/off.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
