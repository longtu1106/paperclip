"use strict";
// Shared by the optional advisory hook and the local-only Paperclip reader.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const ROOT = path.join(os.homedir(), ".gortex-flow");
const EVENTS = new Set([
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SessionEnd",
  "SubagentStart",
  "SubagentStop",
]);
const opaque = (value) =>
  typeof value === "string" && value
    ? createHash("sha256").update(value).digest("hex").slice(0, 24)
    : null;
const identifier = (value) =>
  typeof value === "string" && /^[a-zA-Z0-9_.:/@-]{1,180}$/.test(value)
    ? value
    : null;

function metadata(
  raw,
  agent,
  enrich = "unknown",
  env = process.env,
  now = new Date(),
) {
  const input =
    typeof raw === "string" ? JSON.parse(raw.replace(/^\uFEFF/, "")) : raw;
  if (!input || typeof input !== "object") return null;
  const event = input.hook_event_name || input.hookEventName;
  if (!EVENTS.has(event) || !["codex", "claude"].includes(agent)) return null;
  const cwd =
    typeof input.cwd === "string" &&
    path.isAbsolute(input.cwd) &&
    input.cwd.length <= 500
      ? path.normalize(input.cwd)
      : null;
  const runId = identifier(env.PAPERCLIP_RUN_ID);
  return {
    id: randomUUID(),
    at: now.toISOString(),
    event,
    agent,
    source: runId ? "paperclip" : "local",
    companyId: runId ? identifier(env.PAPERCLIP_COMPANY_ID) : null,
    runId,
    session: opaque(input.session_id || input.sessionId),
    call: opaque(input.tool_use_id || input.tool_call_id || input.toolUseId),
    tool: identifier(input.tool_name || input.toolName),
    cwd,
    // Deliberately omit tool_input, tool_response, prompts, commands and output.
    enrich: ["ok", "unavailable", "unknown"].includes(enrich)
      ? enrich
      : "unknown",
  };
}

function record(raw, agent, enrich, options = {}) {
  try {
    const item = metadata(raw, agent, enrich, options.env, options.now);
    if (!item) return false;
    const root = options.root || ROOT;
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const oldest = new Date(Date.parse(item.at) - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    for (const name of fs.readdirSync(root)) {
      if (
        /^events-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) &&
        name.slice(7, 17) < oldest
      ) {
        try {
          fs.unlinkSync(path.join(root, name));
        } catch {
          /* Retention is best effort. */
        }
      }
    }
    const file = path.join(root, `events-${item.at.slice(0, 10)}.jsonl`);
    try {
      if (fs.statSync(file).size >= 16 * 1024 * 1024) return false;
    } catch (error) {
      if (error.code !== "ENOENT") return false;
    }
    fs.appendFileSync(file, JSON.stringify(item) + "\n", { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function readEvents(root = ROOT, now = new Date()) {
  const items = [];
  for (const offset of [1, 0]) {
    const date = new Date(now.getTime() - offset * 86400000)
      .toISOString()
      .slice(0, 10);
    let fd;
    try {
      fd = fs.openSync(path.join(root, `events-${date}.jsonl`), "r");
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - 512 * 1024);
      const buffer = Buffer.alloc(Math.min(size, 512 * 1024));
      fs.readSync(fd, buffer, 0, buffer.length, start);
      const lines = buffer.toString("utf8").split("\n");
      if (start) lines.shift();
      for (const line of lines) {
        try {
          const item = JSON.parse(line);
          if (
            !EVENTS.has(item.event) ||
            !["codex", "claude"].includes(item.agent) ||
            !/^[a-f0-9-]{36}$/.test(item.id) ||
            !Number.isFinite(Date.parse(item.at))
          )
            continue;
          // Reconstruct the public shape; never return unexpected local fields.
          items.push({
            id: item.id,
            at: item.at,
            event: item.event,
            agent: item.agent,
            source: item.source === "paperclip" ? "paperclip" : "local",
            companyId: identifier(item.companyId),
            runId: identifier(item.runId),
            session: /^[a-f0-9]{24}$/.test(item.session) ? item.session : null,
            call: /^[a-f0-9]{24}$/.test(item.call) ? item.call : null,
            tool: identifier(item.tool),
            cwd: typeof item.cwd === "string" ? item.cwd.slice(0, 500) : null,
            enrich: ["ok", "unavailable"].includes(item.enrich)
              ? item.enrich
              : "unknown",
          });
        } catch {
          /* A truncated concurrent append or corrupt record is ignored. */
        }
      }
    } catch {
      /* Missing spool never blocks the dashboard. */
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }
  return items.sort((a, b) => a.at.localeCompare(b.at)).slice(-1000);
}

module.exports = { ROOT, metadata, record, readEvents };
