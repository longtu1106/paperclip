import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

interface TitleTarget {
  agent: "codex" | "claude";
  session: string | null;
}

export function sessionTitleKey(agent: string, rawId: string) {
  return `${agent}:${createHash("sha256").update(rawId).digest("hex").slice(0, 24)}`;
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  return (
    value
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160) || null
  );
}

function* rows(content: string) {
  for (const line of content.split("\n")) {
    if (!line.trim() || line.length > 65536) continue;
    try {
      const row: unknown = JSON.parse(line);
      if (row && typeof row === "object" && !Array.isArray(row))
        yield row as Record<string, unknown>;
    } catch {
      /* Concurrent partial appends are ignored. */
    }
  }
}

export function parseCodexTitles(content: string, wanted: ReadonlySet<string>) {
  const titles = new Map<string, string>();
  for (const row of rows(content)) {
    if (typeof row.id !== "string") continue;
    const key = sessionTitleKey("codex", row.id);
    if (!wanted.has(key)) continue;
    const title = cleanTitle(row.thread_name);
    if (title) titles.set(key, title);
  }
  return titles;
}

export function parseClaudeTitle(
  content: string,
  rawId: string,
): string | null {
  let custom: string | null = null;
  let automatic: string | null = null;
  // Read only named metadata records; never derive a label from message text.
  const metadata = content
    .split("\n")
    .filter((line) =>
      /"type"\s*:\s*"(?:custom-title|ai-title|summary)"/.test(line),
    )
    .join("\n");
  for (const row of rows(metadata)) {
    if (typeof row.sessionId === "string" && row.sessionId !== rawId) continue;
    if (row.type === "custom-title")
      custom = cleanTitle(row.customTitle) || custom;
    else if (row.type === "ai-title")
      automatic = cleanTitle(row.aiTitle) || automatic;
    else if (row.type === "summary")
      automatic = cleanTitle(row.summary) || automatic;
  }
  return custom || automatic;
}

function boundedRead(file: string, tailBytes: number, headBytes = 0) {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const stat = fstatSync(fd);
    if (!stat.isFile()) return "";
    const start = Math.max(0, stat.size - tailBytes);
    const read = (offset: number, length: number) => {
      const buffer = Buffer.alloc(length);
      const size = readSync(fd!, buffer, 0, length, offset);
      return buffer.subarray(0, size).toString("utf8");
    };
    const tail = read(start, Math.min(stat.size, tailBytes));
    if (!start) return tail;
    const completeTail = tail.slice(tail.indexOf("\n") + 1);
    if (!headBytes) return completeTail;
    const head = read(0, Math.min(start, headBytes));
    return head.slice(0, head.lastIndexOf("\n") + 1) + completeTail;
  } catch {
    return "";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function sessionTitleResolver(
  options: { codexHome?: string; claudeHome?: string; now?: () => number } = {},
) {
  const codexHome =
    options.codexHome ||
    process.env.CODEX_HOME ||
    path.join(os.homedir(), ".codex");
  const claudeHome =
    options.claudeHome ||
    process.env.CLAUDE_CONFIG_DIR ||
    path.join(os.homedir(), ".claude");
  const now = options.now || Date.now;
  let checkedAt = -Infinity;
  let previous = "";
  let cached = new Map<string, string>();
  return {
    resolve(events: readonly TitleTarget[]) {
      const keys = [
        ...new Set(
          events
            .filter((event) => event.session)
            .map((event) => `${event.agent}:${event.session}`),
        ),
      ]
        .slice(-64)
        .sort();
      const fingerprint = keys.join("|");
      if (fingerprint === previous && now() - checkedAt < 10000) return cached;
      const wanted = new Set(keys);
      const titles = parseCodexTitles(
        boundedRead(
          path.join(codexHome, "session_index.jsonl"),
          2 * 1024 * 1024,
        ),
        wanted,
      );
      if (keys.some((key) => key.startsWith("claude:"))) {
        try {
          const projects = path.join(claudeHome, "projects");
          const folders = readdirSync(projects, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .slice(0, 256);
          for (const folder of folders) {
            let files;
            try {
              files = readdirSync(path.join(projects, folder.name), {
                withFileTypes: true,
              });
            } catch {
              continue;
            }
            for (const file of files) {
              if (!file.isFile() || !/^[a-f0-9-]{36}\.jsonl$/i.test(file.name))
                continue;
              const rawId = file.name.slice(0, -6);
              const key = sessionTitleKey("claude", rawId);
              if (!wanted.has(key)) continue;
              const title = parseClaudeTitle(
                boundedRead(
                  path.join(projects, folder.name, file.name),
                  256 * 1024,
                  64 * 1024,
                ),
                rawId,
              );
              if (title) titles.set(key, title);
            }
          }
        } catch {
          /* Metadata is optional; the UI retains its opaque ID fallback. */
        }
      }
      cached = titles;
      checkedAt = now();
      previous = fingerprint;
      return cached;
    },
  };
}
