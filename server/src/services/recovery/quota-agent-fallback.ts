import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { agents, heartbeatRuns, issues, type Db } from "@paperclipai/db";
import { issueService, executeIssuePostCommitActions, type IssuePostCommitAction } from "../issues.js";
import { logActivity, publishActivity, type ActivityPublication } from "../activity-log.js";
import { redactSensitiveText } from "../../redaction.js";
import { isPidAlive } from "../local-service-supervisor.js";

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function quotaFallbackIds(config: unknown): string[] {
  const policy = record(record(config).quotaFallback);
  if (policy.enabled !== true || !Array.isArray(policy.agentIds)) return [];
  return [...new Set(policy.agentIds.filter((id): id is string =>
    typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))].slice(0, 8);
}

type FallbackAgent = Pick<typeof agents.$inferSelect,
  "id" | "companyId" | "status" | "runtimeConfig" | "budgetMonthlyCents" | "spentMonthlyCents">;

export function quotaFallbackEligible(
  source: FallbackAgent,
  candidate: FallbackAgent,
  now: Date,
): boolean {
  if (candidate.companyId !== source.companyId || candidate.id === source.id ||
      candidate.status !== "idle" || !quotaFallbackIds(candidate.runtimeConfig).length) return false;
  if (candidate.budgetMonthlyCents > 0 && candidate.spentMonthlyCents >= candidate.budgetMonthlyCents) return false;
  const policy = record(record(candidate.runtimeConfig).quotaFallback);
  if (typeof policy.cooldownUntil === "string" && Date.parse(policy.cooldownUntil) > now.getTime()) return false;
  const sourceBinding = record(record(source.runtimeConfig).aiConnection);
  const binding = record(record(candidate.runtimeConfig).aiConnection);
  // A different agent sharing the exhausted credential is not a fallback.
  if (sourceBinding.grantId && sourceBinding.grantId === binding.grantId) return false;
  return true;
}

/** Only terminal legacy work is eligible. Reassignment and handoff commit together;
 * assigned-todo recovery is the durable wake backstop after a crash. */
export async function transferQuotaFailedIssue(
  db: Db,
  input: { companyId: string; issueId: string; sourceRunId: string; retryAt: Date },
) {
  const publications: ActivityPublication[] = [];
  const actions: IssuePostCommitAction[] = [];
  const result = await db.transaction(async (tx) => {
    const [issue] = await tx.select().from(issues).where(and(
      eq(issues.id, input.issueId), eq(issues.companyId, input.companyId),
    )).for("update");
    if (!issue || issue.status !== "in_progress" || !issue.assigneeAgentId ||
        issue.assigneeUserId || issue.visibility === "private" || issue.conversationAgentId) return null;
    const [run] = await tx.select().from(heartbeatRuns).where(and(
      eq(heartbeatRuns.id, input.sourceRunId), eq(heartbeatRuns.companyId, input.companyId),
      eq(heartbeatRuns.agentId, issue.assigneeAgentId), eq(heartbeatRuns.issueId, issue.id),
    )).for("update");
    if (!run || !["failed", "timed_out"].includes(run.status) || run.runtimeMode === "native" ||
        (run.processPid && isPidAlive(run.processPid))) return null;
    const live = await tx.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
      eq(heartbeatRuns.companyId, input.companyId), eq(heartbeatRuns.issueId, issue.id),
      inArray(heartbeatRuns.status, ["running", "queued", "scheduled_retry"]),
    )).limit(1);
    if (live.length || (issue.executionRunId && issue.executionRunId !== run.id)) return null;
    const [latest] = await tx.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
      eq(heartbeatRuns.companyId, input.companyId), eq(heartbeatRuns.issueId, issue.id),
    )).orderBy(desc(heartbeatRuns.createdAt), desc(heartbeatRuns.id)).limit(1);
    if (latest?.id !== run.id) return null;
    const [source] = await tx.select().from(agents).where(and(
      eq(agents.id, run.agentId), eq(agents.companyId, input.companyId),
    )).for("update");
    if (!source || !["idle", "error"].includes(source.status)) return null;
    const ids = quotaFallbackIds(source.runtimeConfig);
    if (!ids.length) return null;
    const now = new Date();
    await tx.update(agents).set({
      runtimeConfig: sql`jsonb_set(${agents.runtimeConfig}, '{quotaFallback,cooldownUntil}', ${JSON.stringify(input.retryAt.toISOString())}::jsonb)`,
      updatedAt: now,
    }).where(and(eq(agents.id, source.id), eq(agents.companyId, input.companyId)));
    for (const id of ids) {
      const [candidate] = await tx.select().from(agents).where(and(
        eq(agents.id, id), eq(agents.companyId, input.companyId),
      )).for("update");
      if (!candidate || !quotaFallbackEligible(source, candidate, now)) continue;
      const busy = await tx.select({ id: heartbeatRuns.id }).from(heartbeatRuns).where(and(
        eq(heartbeatRuns.companyId, input.companyId), eq(heartbeatRuns.agentId, id),
        inArray(heartbeatRuns.status, ["running", "queued", "scheduled_retry"]),
      )).limit(1);
      if (busy.length) continue;
      const svc = issueService(tx as unknown as Db);
      // Use the normal issue service to preserve assignment/workspace invariants.
      const policy = { ...record(issue.executionPolicy) };
      delete policy.monitor;
      const updated = await svc.update(issue.id, {
        assigneeAgentId: id, assigneeUserId: null, status: "todo",
        executionPolicy: policy as typeof issue.executionPolicy,
        monitorNextCheckAt: null, monitorWakeRequestedAt: null, monitorNotes: null,
        monitorScheduledBy: null, monitorAttemptCount: 0,
        companyGuard: input.companyId,
      }, tx, publications, actions);
      if (!updated) return null;
      const savedSummary = record(run.resultJson).summary;
      const summary = typeof savedSummary === "string"
        ? redactSensitiveText(savedSummary).slice(-6000) : "";
      await svc.addComment(issue.id, [
        "Automatic provider quota fallback",
        "",
        `Previous owner: ${source.name}. Temporary owner: ${candidate.name}.`,
        `Source run: ${run.id}. Previous credential waits until ${input.retryAt.toISOString()}.`,
        "Continue this task's existing scope, workspace, documents and acceptance criteria. Inspect git status/diff in each affected repository before editing. Verify existing changes; do not repeat completed operations. Provider-private conversation context is not transferred.",
        "Read the task documents and latest progress comments. If critical context was not saved, report exactly what is missing instead of inventing a handoff.",
        ...(summary ? ["", "Last saved assistant progress (unverified):", summary] : []),
      ].join("\n"), {}, { authorType: "system", mirrorToSlack: false }, tx);
      await logActivity(tx as unknown as Db, {
        companyId: input.companyId, actorType: "system", actorId: "quota-fallback",
        action: "issue.quota_fallback", entityType: "issue", entityId: issue.id,
        runId: run.id, details: { fromAgentId: source.id, toAgentId: id, retryAt: input.retryAt.toISOString() },
      });
      return { issueId: issue.id, agentId: id, sourceRunId: run.id };
    }
    return null;
  });
  for (const publication of publications) publishActivity(publication);
  await executeIssuePostCommitActions(db, actions);
  return result;
}
