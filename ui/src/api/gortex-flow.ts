import { api } from "./client";

export interface FlowEvent {
  id: string;
  at: string;
  event: string;
  agent: "codex" | "claude";
  source: "local" | "paperclip";
  companyId: string | null;
  runId: string | null;
  session: string | null;
  call: string | null;
  tool: string | null;
  cwd: string | null;
  enrich: "ok" | "unavailable" | "unknown";
}
export interface FlowRepo {
  name: string;
  path: string;
  workspace: string | null;
  branch: string | null;
  indexed: boolean;
  stale: boolean;
}
export interface FlowSnapshot {
  at: string;
  scope: "local-device";
  events: FlowEvent[];
  collectorInstalled: boolean;
  inventory: { repos: FlowRepo[]; error: string | null; checkedAt: string };
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
