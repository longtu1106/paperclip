"use strict";
// Shared by the optional advisory hook and the local-only Paperclip reader.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const ROOT = path.join(os.homedir(), ".gortex-flow");
function environment(root = ROOT) {
  try {
    const file = path.join(root, "config.json");
    if (fs.statSync(file).size > 65536) return {};
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    return Object.fromEntries(
      Object.entries(config.gortexEnv || {}).filter(
        ([key, value]) =>
          [
            "XDG_CONFIG_HOME",
            "XDG_DATA_HOME",
            "XDG_CACHE_HOME",
            "GORTEX_BINARY",
          ].includes(key) &&
          typeof value === "string" &&
          path.isAbsolute(value),
      ),
    );
  } catch {
    return {};
  }
}
const EVENTS = new Set([
  "SessionStart",
  "PostCompact",
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

// Explicit local opt-in: shell previews never become hook additionalContext.
const SHELL_TOOLS = new Set([
  "Bash",
  "exec_command",
  "shell_command",
  "functions.exec_command",
]);
function sanitizeSnippet(value, limit) {
  if (typeof value !== "string") return null;
  let text = value.slice(0, 8192).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(text))
    return "[Đã ẩn khóa riêng]";
  text = text
    .replace(
      /(https?:\/\/|(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis):\/\/)([^\s/@]+):([^\s/@]+)@/gi,
      "$1[ẩn]@",
    )
    .replace(/\b(cookie|set-cookie|authorization)\s*:\s*[^\r\n]+/gi, "$1: [ẩn]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, "$1 [ẩn]")
    .replace(
      /([\"']?(?:[A-Z0-9_]*(?:token|password|passwd|secret|api[_-]?key|authorization|cookie|credential)[A-Z0-9_-]*)[\"']?\s*[:=]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s,;}]+)/gi,
      "$1[ẩn]",
    )
    .replace(
      /(--?(?:password|passwd|token|secret|api[_-]?key|authorization|cookie)\s+)(?:\"[^\"]*\"|'[^']*'|\S+)/gi,
      "$1[ẩn]",
    )
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[ẩn JWT]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|AKIA[A-Z0-9]{16})\b/g, "[ẩn key]")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .trim();
  return text ? text.slice(0, limit) : null;
}
function shellPreview(input, enabled) {
  const tool = input.tool_name || input.toolName;
  if (!enabled || !SHELL_TOOLS.has(tool)) return null;
  let args = input.tool_input || input.inputs;
  if (typeof args === "string" && args.length <= 16384) {
    try {
      args = JSON.parse(args);
    } catch {
      args = null;
    }
  }
  const response = input.tool_response || input.response;
  const rawCommand =
    args && typeof args === "object" ? (args.command ?? args.cmd) : null;
  // Reading credential files/dumps is not suitable for preview capture.
  const sensitive =
    typeof rawCommand === "string" &&
    /(?:\.env(?:\b|[.])|id_rsa|id_ed25519|credentials|\.pem\b|pg_dump|mongodump)/i.test(
      rawCommand,
    );
  let rawOutput =
    typeof response === "string"
      ? response
      : response && typeof response === "object"
        ? [response.stdout, response.stderr, response.output]
            .filter((value) => typeof value === "string")
            .join("\n")
        : null;
  const exit =
    response && typeof response === "object"
      ? (response.exit_code ?? response.exitCode ?? response.returnCode)
      : null;
  const command = sensitive
    ? "[Đã ẩn lệnh đọc dữ liệu nhạy cảm]"
    : sanitizeSnippet(rawCommand, 200);
  const output =
    typeof rawCommand !== "string"
      ? null
      : sensitive
        ? "[Đã ẩn đầu ra nhạy cảm]"
        : sanitizeSnippet(rawOutput, 400);
  const exitCode =
    Number.isInteger(exit) && Math.abs(exit) <= 2147483647 ? exit : null;
  if (!command && !output && exitCode === null) return null;
  return {
    command,
    output,
    exitCode,
    truncated:
      (typeof rawCommand === "string" && rawCommand.length > 200) ||
      (typeof rawOutput === "string" && rawOutput.length > 400),
  };
}
function captureShellPreview(root) {
  try {
    const file = path.join(root, "config.json");
    return (
      fs.statSync(file).size <= 65536 &&
      JSON.parse(fs.readFileSync(file, "utf8")).captureShellPreview === true
    );
  } catch {
    return false;
  }
}

function metadata(
  raw,
  agent,
  enrich = "unknown",
  env = process.env,
  now = new Date(),
  previewEnabled = false,
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
  const preview = shellPreview(input, previewEnabled);
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
    // Raw payloads remain omitted; only explicit bounded shell previews survive.
    ...(preview ? { shellPreview: preview } : {}),
    enrich: ["ok", "unavailable", "unknown", "skipped"].includes(enrich)
      ? enrich
      : "unknown",
  };
}

function record(raw, agent, enrich, options = {}) {
  try {
    const root = options.root || ROOT;
    const item = metadata(
      raw,
      agent,
      enrich,
      options.env,
      options.now,
      options.captureShellPreview ?? captureShellPreview(root),
    );
    if (!item) return false;
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
            ...(SHELL_TOOLS.has(item.tool) &&
            item.shellPreview &&
            typeof item.shellPreview === "object"
              ? {
                  shellPreview: {
                    command: sanitizeSnippet(item.shellPreview.command, 200),
                    output: sanitizeSnippet(item.shellPreview.output, 400),
                    exitCode:
                      Number.isInteger(item.shellPreview.exitCode) &&
                      Math.abs(item.shellPreview.exitCode) <= 2147483647
                        ? item.shellPreview.exitCode
                        : null,
                    truncated: item.shellPreview.truncated === true,
                  },
                }
              : {}),
            enrich: ["ok", "unavailable", "skipped"].includes(item.enrich)
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

module.exports = {
  ROOT,
  metadata,
  record,
  readEvents,
  environment,
  shellPreview,
  sanitizeSnippet,
};
