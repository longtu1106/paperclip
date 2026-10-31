import type { Issue, IssueThreadInteraction } from "@paperclipai/shared";
import type { LiveRunForIssue } from "../api/heartbeats";

export type TaskExecutionActivity = {
  kind: "checking" | "unknown" | "running" | "queued" | "waiting" | "attention" | "idle";
  label: string;
  detail: string;
};

export function taskExecutionActivity({ issue, runs, loaded, failed, interactions, agentName }: {
  issue: Pick<Issue, "status" | "assigneeAgentId" | "assigneeUserId" | "executionState" | "blockedBy" | "activeRecoveryAction" | "unblockDescriptor">;
  runs: readonly LiveRunForIssue[];
  loaded: boolean;
  failed: boolean;
  interactions: readonly IssueThreadInteraction[];
  agentName: (id: string) => string;
}): TaskExecutionActivity {
  if (failed) return { kind: "unknown", label: "Agent activity unavailable", detail: "Could not verify whether an agent is running. Refresh to check again." };
  if (!loaded) return { kind: "checking", label: "Checking agent activity", detail: "Task status and agent activity are tracked separately." };
  const running = runs.find((run) => run.status === "running");
  if (running) return { kind: "running", label: `${agentName(running.agentId)} is running`, detail: "A live run is active on this task." };
  const queued = runs.find((run) => run.status === "queued");
  if (queued) return { kind: "queued", label: "Queued — agent has not started", detail: `${agentName(queued.agentId)} will work on this task when the queued run starts.` };
  const noRun = "No agent is running on this task.";
  if (issue.status === "done" || issue.status === "cancelled") return { kind: "idle", label: noRun, detail: issue.status === "done" ? "Task completed." : "Task cancelled." };
  const blockers = (issue.blockedBy ?? []).filter((item) => !["done", "cancelled"].includes(item.status));
  if (blockers.length) return {
    kind: "waiting", label: noRun,
    detail: `Waiting for ${blockers.map((item) => "locked" in item && item.locked
      ? "a restricted prerequisite"
      : `${item.title} (${item.identifier ?? "linked task"}; ${item.assigneeAgentId ? agentName(item.assigneeAgentId) : item.assigneeUserId ? "Board" : "unassigned"})`).join("; ")}. Continue after these prerequisites are resolved.`,
  };
  const pending = interactions.find((item) => item.status === "pending");
  if (pending) return { kind: "waiting", label: noRun, detail: "Waiting for a response to the pending question or confirmation in this conversation. Continue after it is answered." };
  if (issue.status === "blocked" && issue.unblockDescriptor) {
    const { owner, action } = issue.unblockDescriptor;
    const name = typeof owner === "object" && "agentId" in owner ? agentName(owner.agentId) : "Board";
    return { kind: "waiting", label: noRun, detail: `Waiting for ${name}: ${action}` };
  }
  const stage = issue.executionState;
  if (stage?.status === "pending" && stage.currentParticipant?.type === "user") return { kind: "waiting", label: noRun, detail: "Waiting for Board review or approval. The current reviewer must submit a decision before work can continue." };
  if (issue.activeRecoveryAction) return { kind: "attention", label: noRun, detail: "Execution needs operator attention. Inspect the recovery notice and restore the current owner or reviewer; approval gates still apply." };
  if (stage?.status === "pending" && stage.currentParticipant?.type === "agent") return { kind: "attention", label: noRun, detail: `Review is pending with ${agentName(stage.currentParticipant.agentId!)}. No reviewer run is active. Start the reviewer, or record the prerequisite that is preventing review.` };
  if (issue.status === "in_progress") return { kind: "attention", label: noRun, detail: "Task is marked In progress, but no live run was found. Check the latest run and queued messages before continuing the owner." };
  if (issue.status === "blocked") return { kind: "attention", label: noRun, detail: "Task is blocked without a linked prerequisite or pending response. Record what is needed, who will resolve it, and when work can resume." };
  if (issue.status === "in_review") return { kind: "attention", label: noRun, detail: "Task is awaiting review. No active reviewer run was found; check the review assignment and next action." };
  return { kind: "idle", label: noRun, detail: "Task is waiting to be started." };
}
