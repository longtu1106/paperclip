import { GitBranch, ArrowRight } from "lucide-react";
import type { FlowSnapshot } from "../api/gortex-flow";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
export function GortexRepoCoverage({
  inventory,
  repo,
  setRepo,
}: {
  inventory: FlowSnapshot["inventory"] | undefined;
  repo: string;
  setRepo: (path: string) => void;
}) {
  return (
    <section className="space-y-3" aria-labelledby="repos-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="repos-heading"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <GitBranch className="size-5" />
          Graph coverage
        </h2>
        {repo && (
          <Button variant="outline" onClick={() => setRepo("")}>
            Bỏ lọc repo
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Repo → workspace từ cấu hình Gortex; chọn repo để lọc phiên. Indexed là
        trạng thái registry, không bảo đảm daemon đã warmup hoặc graph phục vụ
        exact checkout.
      </p>
      {inventory?.error && (
        <p role="alert" className="text-sm text-destructive">
          {inventory.error}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {inventory?.repos.map((item) => (
          <button
            key={item.path}
            onClick={() => {
              setRepo(repo === item.path ? "" : item.path);
            }}
            className={cn(
              "min-w-0 space-y-2 rounded-lg border p-4 text-left hover:bg-accent focus-visible:outline-ring",
              repo === item.path ? "border-primary bg-accent" : "border-border",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">
                {item.workspace || "Chưa gán workspace"}
              </Badge>
              <ArrowRight className="size-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {item.stale
                  ? "Stale"
                  : item.indexed
                    ? "Indexed"
                    : item.indexed === false
                      ? "Chưa index"
                      : "Chưa xác minh"}
              </span>
            </div>
            <p className="break-all text-sm font-medium">{item.name}</p>
            <p className="break-all text-xs text-muted-foreground">
              {item.path}
            </p>
            <p className="break-all text-xs text-muted-foreground">
              {item.branch || "Không có branch"}
            </p>
          </button>
        ))}
      </div>
    </section>
  );
}
