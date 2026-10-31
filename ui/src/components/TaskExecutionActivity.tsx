import { useQuery } from "@tanstack/react-query";
import type { Issue, IssueThreadInteraction } from "@paperclipai/shared";
import { heartbeatsApi } from "../api/heartbeats";
import { queryKeys } from "../lib/queryKeys";
import { taskExecutionActivity } from "../lib/task-execution-activity";

export function TaskExecutionActivity({ issue, interactions, agents }: {
  issue: Issue;
  interactions: IssueThreadInteraction[];
  agents: ReadonlyMap<string, { name: string }>;
}) {
  const runs = useQuery({
    queryKey: queryKeys.issues.liveRuns(issue.id),
    queryFn: () => heartbeatsApi.liveRunsForIssue(issue.id),
    refetchInterval: 3000,
  });
  const activity = taskExecutionActivity({
    issue, interactions, runs: runs.data ?? [], loaded: runs.isSuccess, failed: runs.isError,
    agentName: (id) => agents.get(id)?.name ?? "Assigned agent",
  });
  return (
    <div role="status" aria-live="polite" data-testid="task-execution-activity" data-activity={activity.kind}
      className="flex shrink-0 flex-col gap-1 border-b border-border px-4 py-2 text-sm">
      <p className={activity.kind === "attention" ? "font-medium text-destructive" : "font-medium text-foreground"}>
        {activity.label}
      </p>
      <p className="break-words text-xs text-muted-foreground">{activity.detail}</p>
    </div>
  );
}
