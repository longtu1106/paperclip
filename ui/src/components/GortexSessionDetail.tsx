import { ArrowDown, ArrowRight } from "lucide-react";
import {
  sessionDisplayName,
  toolDisplayName,
  toolStateLabel,
  type FlowSession,
} from "../lib/gortex-flow";
import { GortexShellPreview } from "./GortexShellPreview";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { cn } from "../lib/utils";
const clock = (value: string) => new Date(value).toLocaleTimeString();
const sourceName = (agent: string, source: string) =>
  `${agent === "codex" ? "Codex" : "Claude"} · ${source === "paperclip" ? "Paperclip CLI" : "local"}`;
export function GortexSessionDetail({
  sessions,
  current,
  toolId,
  setSelected,
  setToolId,
}: {
  sessions: FlowSession[];
  current: FlowSession;
  toolId: string;
  setSelected: (id: string) => void;
  setToolId: (id: string) => void;
}) {
  const currentTool = current.tools.find((tool) => tool.id === toolId);
  const events = current.events
    .filter(
      (event) => !currentTool || (event.call ?? event.id) === currentTool.id,
    )
    .slice(-30)
    .reverse();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="min-w-0 gap-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Badge variant="secondary">1</Badge>Nguồn → phiên
        </h3>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {sessions.slice(0, 30).map((session) => (
            <button
              key={session.id}
              aria-pressed={session.id === current.id}
              onClick={() => {
                setSelected(session.id);
                setToolId("");
              }}
              className={cn(
                "w-full space-y-2 rounded-md border p-3 text-left text-sm hover:bg-accent focus-visible:outline-ring",
                session.id === current.id
                  ? "border-primary bg-accent"
                  : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {sourceName(session.agent, session.source)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {clock(session.at)}
                </span>
              </div>
              <p
                className="break-words text-sm font-medium"
                title={sessionDisplayName(session)}
              >
                {sessionDisplayName(session)}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {session.cwd || "Không có đường dẫn"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">
                  {session.id.split(":").at(-1)?.slice(0, 10)}
                </span>
                <Badge variant="outline">
                  {session.stopped
                    ? "Đã dừng"
                    : `${session.tools.filter((tool) => tool.state === "running").length} tool chạy`}
                </Badge>
              </div>
            </button>
          ))}
        </div>
        {sessions.length > 30 && (
          <p className="text-xs text-muted-foreground">
            Hiện 30 phiên gần nhất trong {sessions.length} phiên.
          </p>
        )}
      </Card>
      <Card className="min-w-0 gap-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Badge variant="secondary">2</Badge>
          <ArrowRight className="size-4" />
          Tool của phiên
        </h3>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {current.tools
            .slice(-20)
            .reverse()
            .map((tool) => (
              <button
                key={tool.id}
                aria-pressed={tool.id === currentTool?.id}
                onClick={() => setToolId(toolId === tool.id ? "" : tool.id)}
                className={cn(
                  "w-full space-y-2 rounded-md border p-3 text-left hover:bg-accent focus-visible:outline-ring",
                  tool.id === currentTool?.id
                    ? "border-primary bg-accent"
                    : "border-border",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1 size-2 shrink-0 rounded-full",
                      tool.state === "running"
                        ? "animate-pulse bg-primary"
                        : tool.state === "failed"
                          ? "bg-destructive"
                          : "bg-muted-foreground",
                    )}
                  />
                  <span className="break-all font-mono text-xs">
                    {toolDisplayName(tool)}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{toolStateLabel(tool)}</span>
                  <span>{clock(tool.at)}</span>
                </div>
              </button>
            ))}
          {!current.tools.length && (
            <p className="text-sm text-muted-foreground">
              Phiên mới có sự kiện phiên, chưa có tool.
            </p>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Thiếu completion hoặc quá 5 phút: “Chưa xác nhận”. “Đã trả về” không
          khẳng định tool thành công.
        </p>
      </Card>
      <Card className="min-w-0 gap-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Badge variant="secondary">3</Badge>
          <ArrowDown className="size-4" />
          Sự kiện {currentTool ? "của tool" : "của phiên"}
        </h3>
        {currentTool && <GortexShellPreview preview={currentTool.preview} />}
        <ol className="max-h-80 space-y-3 overflow-y-auto">
          {events.map((event) => (
            <li
              key={event.id}
              className="space-y-1 border-l-2 border-border pl-3 text-xs"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-medium">{event.event}</span>
                <time className="text-muted-foreground">{clock(event.at)}</time>
              </div>
              <p className="break-all text-muted-foreground">
                {event.tool || "Session event"}
              </p>
              <p
                className={
                  event.enrich === "unavailable"
                    ? "text-destructive"
                    : "text-muted-foreground"
                }
              >
                Enrichment:{" "}
                {event.enrich === "skipped"
                  ? event.shellPreview
                    ? "bản xem trước rút gọn · không gọi enrichment"
                    : "chỉ metadata · không gọi enrichment"
                  : event.enrich === "ok"
                    ? "hook đã phản hồi"
                    : event.enrich === "unavailable"
                      ? "fallback filesystem"
                      : "chưa rõ"}
              </p>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
