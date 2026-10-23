import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Extends only the existing advisory adapter. Does not rewrite host settings,
// MCP configuration, independent hooks, daemon state or tracked repositories.
const root = path.join(os.homedir(), ".gortex-flow");
const adapterArg = process.argv.indexOf("--adapter");
const adapter =
  adapterArg >= 0
    ? path.resolve(process.argv[adapterArg + 1])
    : path.join(os.homedir(), ".codex", "hooks", "gortex-fallback.cjs");
const original = fs.readFileSync(adapter, "utf8");
if (
  !original.includes("function runHook(") ||
  !original.includes("--mode=enrich")
) {
  throw new Error(
    "Expected the installed Gortex advisory adapter; no files changed.",
  );
}
const oldLine =
  "const result = runHook(fs.readFileSync(0, 'utf8'), arg ? arg.slice(8) : 'codex');";
const block = `// gortex-flow:start
    const raw = fs.readFileSync(0, 'utf8');
    const agent = arg ? arg.slice(8) : 'codex';
    let enrich = 'unavailable';
    const result = runHook(raw, agent, (...args) => {
      const response = spawnSync(...args);
      enrich = !response.error && !response.signal && response.status === 0 ? 'ok' : 'unavailable';
      return response;
    });
    if (process.env.GORTEX_FLOW_DISABLED !== '1') {
      try { require(path.join(os.homedir(), '.gortex-flow', 'hook-events.cjs')).record(raw, agent, enrich); }
      catch { /* Optional observation must never block an authorized tool. */ }
    }
    // gortex-flow:end`;
const updated = original.includes("// gortex-flow:start")
  ? original.replace(
      /\/\/ gortex-flow:start[\s\S]*?\/\/ gortex-flow:end/,
      block,
    )
  : original.replace(oldLine, block);
if (updated === original && !original.includes("// gortex-flow:start"))
  throw new Error("Adapter entrypoint changed; refusing an ambiguous patch.");
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const collector = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "gortex-flow-events.cjs",
);
if (updated !== original) {
  fs.copyFileSync(adapter, path.join(root, `adapter-backup-${Date.now()}.cjs`));
  fs.writeFileSync(adapter, updated);
}
fs.copyFileSync(collector, path.join(root, "hook-events.cjs"));
console.log(
  JSON.stringify({
    adapter,
    collector: path.join(root, "hook-events.cjs"),
    changed: updated !== original,
  }),
);
