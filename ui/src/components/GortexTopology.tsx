import { useId } from "react";
import type { FlowSession } from "../lib/gortex-flow";
import { cn } from "../lib/utils";

export function GortexTopology({
  session,
  selectedTool,
  onSelectTool,
}: {
  session: FlowSession;
  selectedTool: string;
  onSelectTool: (id: string) => void;
}) {
  const marker = useId().replace(/:/g, "");
  const tools = session.tools.slice(-6).reverse();
  const height = Math.max(180, tools.length * 72 + 40);
  const center = height / 2;
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border bg-muted/20 p-3"
      aria-label="Graph sự kiện của phiên đang chọn"
    >
      <svg
        className="w-full min-w-2xl"
        viewBox={`0 0 900 ${height}`}
        role="group"
        aria-label="Nguồn → phiên → tool; chọn node tool để xem sự kiện"
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
          </marker>
        </defs>
        <path
          d={`M 220 ${center} H 310`}
          stroke="var(--muted-foreground)"
          fill="none"
          markerEnd={`url(#${marker})`}
        />
        {tools.map((tool, index) => (
          <path
            key={tool.id}
            d={`M 550 ${center} C 605 ${center}, 605 ${index * 72 + 52}, 660 ${index * 72 + 52}`}
            fill="none"
            stroke={
              tool.state === "running" ? "var(--primary)" : "var(--border)"
            }
            strokeWidth={tool.state === "running" ? 2 : 1}
            markerEnd={`url(#${marker})`}
          />
        ))}
        <foreignObject x="0" y={center - 36} width="220" height="72">
          <div className="flex h-full flex-col justify-center gap-1 rounded-lg border border-border bg-card p-3">
            <span className="text-xs text-muted-foreground">
              Nguồn phát hook
            </span>
            <span className="text-sm font-semibold">
              {session.agent === "codex" ? "Codex" : "Claude"} ·{" "}
              {session.source === "paperclip" ? "Paperclip CLI" : "local"}
            </span>
          </div>
        </foreignObject>
        <foreignObject x="310" y={center - 36} width="240" height="72">
          <div className="flex h-full flex-col justify-center gap-1 rounded-lg border border-primary bg-card p-3">
            <span className="text-xs text-muted-foreground">
              Phiên · {session.stopped ? "đã dừng" : "sự kiện gần nhất"}
            </span>
            <span className="truncate font-mono text-xs">
              {session.id.split(":").at(-1)?.slice(0, 16)}
            </span>
          </div>
        </foreignObject>
        {tools.map((tool, index) => (
          <foreignObject
            key={tool.id}
            x="660"
            y={index * 72 + 20}
            width="235"
            height="64"
          >
            <button
              aria-pressed={selectedTool === tool.id}
              onClick={() =>
                onSelectTool(selectedTool === tool.id ? "" : tool.id)
              }
              className={cn(
                "flex h-full w-full flex-col justify-center gap-1 rounded-lg border bg-card p-3 text-left hover:bg-accent focus-visible:outline-ring",
                selectedTool === tool.id || tool.state === "running"
                  ? "border-primary"
                  : "border-border",
              )}
            >
              <span className="truncate font-mono text-xs">{tool.name}</span>
              <span className="text-xs text-muted-foreground">
                {tool.state === "running"
                  ? "● Đang chạy"
                  : tool.state === "returned"
                    ? "Đã trả về"
                    : tool.state === "failed"
                      ? "Lỗi"
                      : "Chưa xác nhận"}
              </span>
            </button>
          </foreignObject>
        ))}
        {!tools.length && (
          <text x="660" y={center} className="fill-muted-foreground text-sm">
            Chưa có tool event
          </text>
        )}
      </svg>
      <p className="text-xs text-muted-foreground">
        Node và cạnh từ hook quan sát được · tối đa 6 tool gần nhất · chọn node
        để xem chi tiết.
      </p>
    </div>
  );
}
