import type { FlowEvent, ShellPreview } from "../api/gortex-flow";

export interface FlowTool {
  id: string;
  name: string;
  startedAt: string | null;
  preview?: ShellPreview;
  at: string;
  state: "running" | "returned" | "failed" | "unknown";
}
export interface FlowSession {
  id: string;
  title: string | null;
  agent: FlowEvent["agent"];
  source: FlowEvent["source"];
  cwd: string | null;
  at: string;
  events: FlowEvent[];
  tools: FlowTool[];
  stopped: boolean;
  runId: string | null;
}

export function flowSessions(
  events: FlowEvent[],
  now = Date.now(),
): FlowSession[] {
  const sessions = new Map<string, FlowSession>();
  for (const event of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const id = `${event.source}:${event.agent}:${event.runId ?? event.session ?? event.id}`;
    let session = sessions.get(id);
    if (!session) {
      session = {
        id,
        title: event.sessionTitle || null,
        agent: event.agent,
        source: event.source,
        cwd: event.cwd,
        at: event.at,
        events: [],
        tools: [],
        stopped: false,
        runId: event.runId,
      };
      sessions.set(id, session);
    }
    session.events.push(event);
    session.at = event.at;
    session.cwd = event.cwd || session.cwd;
    session.title = event.sessionTitle || session.title;
    if (["Stop", "SessionEnd"].includes(event.event)) {
      session.stopped = true;
      for (const tool of session.tools) {
        if (tool.state === "running") tool.state = "unknown";
      }
    } else if (
      ["SessionStart", "UserPromptSubmit", "PreToolUse"].includes(event.event)
    ) {
      session.stopped = false;
    }
    if (
      !["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(event.event)
    )
      continue;
    // Never infer a parallel call's completion from its tool name or order.
    const callId = event.call ?? event.id;
    let tool = session.tools.find((item) => item.id === callId);
    if (!tool) {
      tool = {
        id: callId,
        name: event.tool || "Unknown tool",
        startedAt: null,
        at: event.at,
        state: "unknown",
      };
      session.tools.push(tool);
    }
    tool.at = event.at;
    if (event.shellPreview)
      tool.preview = {
        command: event.shellPreview.command ?? tool.preview?.command ?? null,
        output: event.shellPreview.output ?? tool.preview?.output ?? null,
        exitCode: event.shellPreview.exitCode ?? tool.preview?.exitCode ?? null,
        truncated:
          event.shellPreview.truncated || tool.preview?.truncated || false,
      };
    if (event.event === "PreToolUse") {
      tool.startedAt = event.at;
      tool.state = "running";
    } else
      tool.state = event.event === "PostToolUseFailure" ? "failed" : "returned";
  }
  return [...sessions.values()]
    .map((session) => ({
      ...session,
      tools: session.tools.map((tool) => ({
        ...tool,
        state:
          tool.state === "running" &&
          (session.stopped || now - Date.parse(tool.at) > 300000)
            ? "unknown"
            : tool.state,
      })),
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function sessionDisplayName(session: Pick<FlowSession, "id" | "title">) {
  return session.title || `Phiên ${session.id.split(":").at(-1)?.slice(0, 8)}`;
}

export function pathContains(parent: string, child: string | null) {
  if (!child) return false;
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/$/, "");
  const base = normalize(parent);
  const target = normalize(child);
  // Windows checkout paths are case-insensitive; Unix paths are not.
  const windows = /^[a-z]:/i.test(base);
  const left = windows ? base.toLowerCase() : base;
  const right = windows ? target.toLowerCase() : target;
  return right === left || right.startsWith(left + "/");
}

export function toolStateLabel(tool: FlowTool) {
  return tool.state === "running"
    ? "Đang chạy"
    : tool.state === "failed" ||
        (tool.preview?.exitCode != null && tool.preview.exitCode !== 0)
      ? "Lỗi"
      : tool.state === "returned"
        ? tool.preview?.exitCode === 0
          ? "Hoàn tất"
          : "Đã trả về"
        : "Chưa xác nhận";
}
export function toolDisplayName(tool: FlowTool) {
  const time = new Date(tool.startedAt ?? tool.at).toLocaleTimeString("vi-VN", {
    hour12: false,
  });
  return `${tool.name} · ${time} · ${toolStateLabel(tool)}`;
}
