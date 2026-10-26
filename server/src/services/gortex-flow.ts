import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { existsSync, readFileSync, statSync } from "node:fs";
import { parse } from "yaml";
import { sessionTitleResolver } from "./gortex-flow-titles.js";

const require = createRequire(import.meta.url);
// Same collector code is installed beside the optional desktop hook.
const collector = require("../../../scripts/gortex-flow-events.cjs") as {
  ROOT: string;
  readEvents: () => { agent: "codex" | "claude"; session: string | null }[];
  environment: () => NodeJS.ProcessEnv;
};

export interface FlowRepo {
  name: string;
  path: string;
  workspace: string | null;
  branch: string | null;
  indexed: boolean | null;
  stale: boolean | null;
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
      indexed: typeof row.indexed === "boolean" ? row.indexed : null,
      stale: typeof row.stale === "boolean" ? row.stale : null,
    }));
}

export function parseFlowRegistry(content: string): FlowRepo[] {
  const data = parse(content, { maxAliasCount: 0 });
  if (!Array.isArray(data?.repos)) throw new Error("Invalid Gortex registry");
  return parseFlowRepos(
    JSON.stringify(
      data.repos
        .filter((repo: { path?: unknown }) => typeof repo?.path === "string")
        .map((repo: { path: string; name?: string; workspace?: string }) => ({
          path: repo.path,
          name: repo.name || path.basename(repo.path.replace(/\\/g, "/")),
          workspace: repo.workspace,
        })),
    ),
  );
}

function registryFallback(env: NodeJS.ProcessEnv) {
  const candidates = env.XDG_CONFIG_HOME
    ? [path.join(env.XDG_CONFIG_HOME, "gortex", "config.yaml")]
    : [
        path.join(
          env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
          "gortex",
          "config.yaml",
        ),
        path.join(os.homedir(), ".gortex", "config.yaml"),
      ];
  for (const file of candidates) {
    try {
      if (statSync(file).size <= 1024 * 1024)
        return {
          repos: parseFlowRegistry(readFileSync(file, "utf8")),
          error: null,
        };
    } catch {
      /* Try the legacy registry, without opening or repairing a graph store. */
    }
  }
  return {
    repos: [] as FlowRepo[],
    error:
      "Không đọc được registry Gortex local. Công cụ filesystem vẫn dùng được.",
  };
}

export function gortexFlowService() {
  const sessionTitles = sessionTitleResolver();
  let cached: {
    repos: FlowRepo[];
    error: string | null;
    checkedAt: string;
    source: "config";
  } | null = null;
  function inventory() {
    if (cached && Date.now() - Date.parse(cached.checkedAt) < 30000)
      return cached;
    const env = { ...process.env, ...collector.environment() };
    cached = {
      ...registryFallback(env),
      source: "config",
      checkedAt: new Date().toISOString(),
    };
    return cached;
  }
  return {
    async snapshot() {
      const events = collector.readEvents();
      const titles = sessionTitles.resolve(events);
      return {
        at: new Date().toISOString(),
        scope: "local-device" as const,
        events: events.map((event) => ({
          ...event,
          sessionTitle: titles.get(`${event.agent}:${event.session}`) || null,
        })),
        inventory: inventory(),
        collectorInstalled: existsSync(
          path.join(collector.ROOT, "hook-events.cjs"),
        ),
      };
    },
  };
}
