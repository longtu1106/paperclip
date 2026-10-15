import path from "node:path";
import { pathToFileURL } from "node:url";
import { claimServer, releaseServer, setup, readJson, writeJson, sourceHead, runtimeRoot, stopPath, repoRoot, configPath, instanceRoot } from "./windows-local.mjs";

setup();
if (process.env.PAPERCLIP_CONFIG !== configPath || process.env.PAPERCLIP_HOME !== path.dirname(path.dirname(instanceRoot))) {
  throw new Error("Start this entry through windows-local.mjs start, with its isolated environment.");
}
const record = claimServer();
let timer;
let stopping = false;
try {
  const { startServer } = await import(pathToFileURL(path.join(repoRoot, "server/src/index.ts")).href);
  const server = await startServer();
  writeJson(path.join(runtimeRoot, "last-start.json"), { sourceHead: sourceHead(), startedAt: new Date().toISOString() });
  console.log("[windows-local] Ready on localhost:3100. Native local adapters; execution=" + process.env.HEARTBEAT_SCHEDULER_ENABLED);
  timer = setInterval(async () => {
    if (stopping) return;
    const request = readJson(stopPath);
    if (request?.nonce !== record.nonce || request?.pid !== record.pid) return;
    stopping = true;
    clearInterval(timer);
    await server.shutdown("SIGTERM");
    releaseServer(record);
    process.exit(0);
  }, 500);
  process.once("exit", () => releaseServer(record));
} catch (error) {
  if (timer) clearInterval(timer);
  releaseServer(record);
  // Keep diagnostics in the private runtime logs, never credentials in CLI output.
  console.error(error);
  process.exitCode = 1;
}
