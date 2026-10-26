import { useId } from "react";
import type { FlowEvent } from "../api/gortex-flow";
import { cn } from "../lib/utils";

export function GortexIngressMap({
  events,
  installed,
  source,
  onSelectSource,
}: {
  events: FlowEvent[];
  installed: boolean;
  source: string;
  onSelectSource: (source: string) => void;
}) {
  const marker = useId().replace(/:/g, "");
  const sources = [
    {
      id: "codex",
      name: "Codex local",
      items: events.filter(
        (event) => event.agent === "codex" && event.source === "local",
      ),
    },
    {
      id: "claude",
      name: "Claude Code local",
      items: events.filter(
        (event) => event.agent === "claude" && event.source === "local",
      ),
    },
    {
      id: "paperclip",
      name: "Paperclip CLI",
      items: events.filter((event) => event.source === "paperclip"),
    },
  ];
  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">Sơ đồ kết nối hook</h3>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 900 250"
          className="w-full min-w-2xl"
          role="group"
          aria-label="Codex, Claude và Paperclip gửi metadata qua collector tới dashboard"
        >
          <defs>
            <marker
              id={marker}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
            </marker>
          </defs>
          {sources.map((item, index) => (
            <g key={item.id}>
              <path
                d={`M 235 ${index * 78 + 45} C 300 ${index * 78 + 45}, 300 122, 360 122`}
                stroke="var(--border)"
                fill="none"
                markerEnd={`url(#${marker})`}
              />
              <foreignObject x="0" y={index * 78 + 10} width="235" height="70">
                <button
                  aria-pressed={source === item.id}
                  onClick={() =>
                    onSelectSource(source === item.id ? "all" : item.id)
                  }
                  className={cn(
                    "flex h-full w-full flex-col justify-center gap-1 rounded-lg border bg-card p-3 text-left hover:bg-accent focus-visible:outline-ring",
                    source === item.id ? "border-primary" : "border-border",
                  )}
                >
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.items.length
                      ? `${item.items.length} event · ${new Date(item.items.at(-1)!.at).toLocaleTimeString()}`
                      : "Chưa nhận hook"}
                  </span>
                </button>
              </foreignObject>
            </g>
          ))}
          <path
            d="M 585 122 H 675"
            stroke="var(--muted-foreground)"
            fill="none"
            markerEnd={`url(#${marker})`}
          />
          <foreignObject x="360" y="87" width="225" height="70">
            <div className="flex h-full flex-col justify-center gap-1 rounded-lg border border-border bg-card p-3">
              <span className="text-sm font-medium">Local collector</span>
              <span className="text-xs text-muted-foreground">
                {installed ? "Đã cài · advisory" : "Chưa xác nhận cài đặt"}
              </span>
            </div>
          </foreignObject>
          <foreignObject x="675" y="87" width="220" height="70">
            <div className="flex h-full flex-col justify-center gap-1 rounded-lg border border-primary bg-card p-3">
              <span className="text-sm font-medium">Paperclip dashboard</span>
              <span className="text-xs text-muted-foreground">
                {events.length} event quan sát được
              </span>
            </div>
          </foreignObject>
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        Cạnh thể hiện kết nối đã cấu hình. Chỉ khi có event mới xác nhận client
        đã phát hook. Bấm nguồn để lọc.
      </p>
    </div>
  );
}
