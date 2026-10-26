import { api } from "./client";

export interface ShellPreview {
  command: string | null;
  output: string | null;
  exitCode: number | null;
  truncated: boolean;
}
export interface FlowEvent {
  id: string;
  at: string;
  event: string;
  agent: "codex" | "claude";
  source: "local" | "paperclip";
  companyId: string | null;
  runId: string | null;
  session: string | null;
  sessionTitle?: string | null;
  call: string | null;
  tool: string | null;
  shellPreview?: ShellPreview;
  cwd: string | null;
  enrich: "ok" | "unavailable" | "unknown" | "skipped";
}
export interface FlowRepo {
  name: string;
  path: string;
  workspace: string | null;
  branch: string | null;
  indexed: boolean | null;
  stale: boolean | null;
}
export interface FlowSnapshot {
  at: string;
  scope: "local-device";
  events: FlowEvent[];
  collectorInstalled: boolean;
  inventory: {
    repos: FlowRepo[];
    error: string | null;
    checkedAt: string;
    source: "cli" | "config";
  };
}
export interface FlowRun {
  id: string;
  agentId: string;
  agentName: string;
  adapterType: string;
  status: string;
}
export const gortexFlowApi = {
  snapshot: () => api.get<FlowSnapshot>("/local/gortex-flow"),
  runs: (companyId: string) =>
    api.get<FlowRun[]>(`/companies/${companyId}/live-runs?limit=50`),
};
