import type { FlowRun, FlowSnapshot, ShellPreview } from "../api/gortex-flow";
import {
  flowSessions,
  pathContains,
  sessionDisplayName,
  toolDisplayName,
  toolStateLabel,
} from "./gortex-flow";

export type NetworkKind =
  "workspace" | "repo" | "source" | "session" | "tool" | "run";
export interface NetworkNode {
  id: string;
  kind: NetworkKind;
  label: string;
  detail: string;
  state: string;
  running?: boolean;
  preview?: ShellPreview;
}
export interface NetworkEdge {
  from: string;
  to: string;
  label: string;
}
export interface Network {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}
export const networkKinds: { id: NetworkKind; label: string; color: string }[] =
  [
    {
      id: "workspace",
      label: "Workspace",
      color: "var(--gortex-node-workspace)",
    },
    { id: "repo", label: "Repository", color: "var(--gortex-node-repo)" },
    { id: "source", label: "Nguồn agent", color: "var(--gortex-node-source)" },
    { id: "session", label: "Phiên", color: "var(--gortex-node-session)" },
    { id: "tool", label: "Tool", color: "var(--gortex-node-tool)" },
    { id: "run", label: "Paperclip run", color: "var(--gortex-node-run)" },
  ];

export function buildNetwork(
  snapshot: FlowSnapshot | undefined,
  runs: FlowRun[] = [],
): Network {
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  const add = (node: NetworkNode) => nodes.set(node.id, node);
  const repos = snapshot?.inventory.repos ?? [];
  for (const repo of repos) {
    const id = `repo:${repo.path}`;
    add({
      id,
      kind: "repo",
      label: repo.name,
      detail: repo.path,
      state: repo.stale
        ? "Stale"
        : repo.indexed
          ? "Indexed (registry)"
          : "Freshness chưa xác minh",
    });
    if (repo.workspace) {
      const workspace = `workspace:${repo.workspace}`;
      add({
        id: workspace,
        kind: "workspace",
        label: repo.workspace,
        detail: "Nhóm repo trong Gortex",
        state: "Cấu hình registry",
      });
      edges.push({ from: workspace, to: id, label: "workspace chứa repo" });
    }
  }
  for (const run of runs.slice(0, 30)) {
    const id = `run:${run.id}`;
    add({
      id,
      kind: "run",
      label: run.agentName,
      detail: `${run.adapterType} · ${run.id}`,
      state: run.status,
      running: run.status === "running",
    });
  }
  for (const session of flowSessions(snapshot?.events ?? []).slice(0, 12)) {
    const source = `source:${session.agent}:${session.source}`;
    add({
      id: source,
      kind: "source",
      label: `${session.agent === "codex" ? "Codex" : "Claude"} · ${session.source === "paperclip" ? "Paperclip CLI" : "local"}`,
      detail: "Nguồn từ metadata hook đã nhận",
      state: "Đã nhận hook",
    });
    const id = `session:${session.id}`;
    const running = session.tools.some((tool) => tool.state === "running");
    add({
      id,
      kind: "session",
      label: sessionDisplayName(session),
      detail: session.cwd || "CWD không được gửi",
      state: session.stopped
        ? "Đã dừng"
        : running
          ? "Có tool đang chạy"
          : "Đã nhận sự kiện",
      running,
    });
    edges.push({ from: source, to: id, label: "phát hook cho phiên" });
    const repo = [...repos]
      .sort((a, b) => b.path.length - a.path.length)
      .find((repo) => pathContains(repo.path, session.cwd));
    if (repo)
      edges.push({
        from: id,
        to: `repo:${repo.path}`,
        label: "CWD nằm trong repo",
      });
    if (session.runId && nodes.has(`run:${session.runId}`))
      edges.push({
        from: `run:${session.runId}`,
        to: id,
        label: "run khởi chạy phiên",
      });
    for (const tool of session.tools.slice(-6)) {
      const toolId = `tool:${session.id}:${tool.id}`;
      add({
        id: toolId,
        kind: "tool",
        label: toolDisplayName(tool),
        preview: tool.preview,
        detail: `Call ${tool.id} · ${new Date(tool.at).toLocaleTimeString()}`,
        state: toolStateLabel(tool),
        running: tool.state === "running",
      });
      edges.push({ from: id, to: toolId, label: "phiên gọi tool" });
    }
  }
  return { nodes: [...nodes.values()], edges };
}

export interface NetworkPoint3D {
  x: number;
  y: number;
  z: number;
}
// Session anchors stay inside a central sphere from every camera angle.
export function networkLayout3D(
  network: Network,
): Record<string, NetworkPoint3D> {
  const points: Record<string, NetworkPoint3D> = {};
  const sessions = network.nodes.filter((node) => node.kind === "session");
  const sphere = (
    index: number,
    count: number,
    radius: number,
  ): NetworkPoint3D => {
    const y = 1 - (2 * (index + 0.5)) / Math.max(1, count);
    const angle = index * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt(1 - y * y);
    return {
      x: Math.cos(angle) * r * radius,
      y: y * radius,
      z: Math.sin(angle) * r * radius,
    };
  };
  sessions.forEach((node, index) => {
    points[node.id] =
      sessions.length === 1
        ? { x: 0, y: 0, z: 0 }
        : sphere(index, sessions.length, 105);
  });
  const tools = network.nodes.filter((node) => node.kind === "tool");
  tools.forEach((node, index) => {
    points[node.id] = sphere(index, tools.length, 225);
  });
  const outer = network.nodes.filter(
    (node) => node.kind !== "session" && node.kind !== "tool",
  );
  outer.forEach((node, index) => {
    points[node.id] = sphere(index, outer.length, 325);
  });
  return points;
}
