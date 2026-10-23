import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

const require = createRequire(import.meta.url);
// Same collector code is installed beside the optional desktop hook.
const collector = require("../../../scripts/gortex-flow-events.cjs") as {
  ROOT: string;
  readEvents: () => unknown[];
};

export interface FlowRepo {
  name: string;
  path: string;
  workspace: string | null;
  branch: string | null;
  indexed: boolean;
  stale: boolean;
}

export function parseFlowRepos(output: string): FlowRepo[] {
  const data: unknown = JSON.parse(output);
  if (!Array.isArray(data)) throw new Error("Invalid repository inventory");
  return data
    .filter(
      (row) =>
        row && typeof row.name === "string" && typeof row.path === "string",
    )
    .slice(0, 100)
    .map((row) => ({
      name: row.name.slice(0, 200),
      path: row.path.slice(0, 500),
      workspace:
        typeof row.workspace === "string" ? row.workspace.slice(0, 100) : null,
      branch: typeof row.branch === "string" ? row.branch.slice(0, 200) : null,
      indexed: row.indexed === true,
      stale: row.stale === true,
    }));
}

export function gortexFlowService() {
  type Inventory = {
    repos: FlowRepo[];
    error: string | null;
    checkedAt: string;
  };
  let cached: Inventory | null = null;
  let pending: Promise<Inventory> | null = null;
  async function inventory() {
    if (cached && Date.now() - Date.parse(cached.checkedAt) < 30000)
      return cached;
    if (pending) return pending;
    const installed = path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Programs",
      "gortex",
      "gortex.exe",
    );
    const binary =
      process.env.GORTEX_BINARY ||
      (process.platform === "win32" && existsSync(installed)
        ? installed
        : "gortex");
    pending = new Promise<Inventory>((resolve) => {
      execFile(
        binary,
        ["repos", "--json"],
        { timeout: 2500, maxBuffer: 256 * 1024, windowsHide: true },
        (error, stdout) => {
          try {
            cached = {
              repos: error ? [] : parseFlowRepos(stdout),
              error: error
                ? "Gortex inventory unavailable; native tools remain allowed."
                : null,
              checkedAt: new Date().toISOString(),
            };
          } catch {
            cached = {
              repos: [],
              error:
                "Gortex returned an invalid inventory; native tools remain allowed.",
              checkedAt: new Date().toISOString(),
            };
          }
          resolve(cached);
        },
      );
    }).finally(() => {
      pending = null;
    });
    return pending;
  }
  return {
    async snapshot() {
      return {
        at: new Date().toISOString(),
        scope: "local-device" as const,
        events: collector.readEvents(),
        inventory: await inventory(),
        collectorInstalled: existsSync(
          path.join(collector.ROOT, "hook-events.cjs"),
        ),
      };
    },
  };
}
