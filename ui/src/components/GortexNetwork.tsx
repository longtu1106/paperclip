import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { FlowRun, FlowSnapshot } from "../api/gortex-flow";
import {
  buildNetwork,
  networkKinds,
  type NetworkKind,
} from "../lib/gortex-network";
import { GortexNetworkCanvas } from "./GortexNetworkCanvas";
import { GortexShellPreview } from "./GortexShellPreview";
import { Badge } from "./ui/badge";

export function GortexNetwork({
  snapshot,
  runs,
}: {
  snapshot: FlowSnapshot | undefined;
  runs: FlowRun[];
}) {
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<NetworkKind>>(
    new Set(networkKinds.map((kind) => kind.id)),
  );
  const [hideIsolated, setHideIsolated] = useState(false);
  const [selected, setSelected] = useState("");
  const [labels, setLabels] = useState<"auto" | "all" | "none">("auto");
  const network = useMemo(() => buildNetwork(snapshot, runs), [snapshot, runs]);
  const filtered = useMemo(() => {
    const matches = new Set(
      network.nodes
        .filter((node) =>
          (node.label + node.detail)
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .map((node) => node.id),
    );
    const neighbors = new Set(matches);
    if (query)
      for (const edge of network.edges) {
        if (matches.has(edge.from)) neighbors.add(edge.to);
        if (matches.has(edge.to)) neighbors.add(edge.from);
      }
    const allowed = new Set(
      network.nodes
        .filter(
          (node) => kinds.has(node.kind) && (!query || neighbors.has(node.id)),
        )
        .map((node) => node.id),
    );
    const edges = network.edges.filter(
      (edge) => allowed.has(edge.from) && allowed.has(edge.to),
    );
    const connected = new Set(edges.flatMap((edge) => [edge.from, edge.to]));
    return {
      nodes: network.nodes.filter(
        (node) =>
          allowed.has(node.id) && (!hideIsolated || connected.has(node.id)),
      ),
      edges,
    };
  }, [network, query, kinds, hideIsolated]);
  const current = network.nodes.find((node) => node.id === selected);
  const adjacent = current
    ? network.edges.filter(
        (edge) => edge.from === current.id || edge.to === current.id,
      )
    : [];
  return (
    <section className="space-y-3" aria-label="Graph Gortex">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Đồ thị Gortex</h2>
          <p className="text-xs text-muted-foreground">
            Không gian 3D của các phiên và quan hệ quan sát được. Kéo để xoay,
            chọn node để làm nổi bật kết nối.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Nhãn
            <select
              value={labels}
              onChange={(event) =>
                setLabels(event.target.value as typeof labels)
              }
              className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            >
              <option value="auto">Tự động</option>
              <option value="all">Tất cả</option>
              <option value="none">Ẩn</option>
            </select>
          </label>
          <label className="flex min-w-0 items-center gap-2 rounded-md border border-input bg-background px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              className="h-9 min-w-0 bg-transparent text-sm outline-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm repo, phiên, tool…"
              aria-label="Tìm node trong graph"
            />
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="min-w-0 flex-1">
          <GortexNetworkCanvas
            network={filtered}
            labels={labels}
            selected={selected}
            onSelect={setSelected}
          />
          {!filtered.nodes.length && (
            <p className="py-3 text-sm text-muted-foreground">
              {snapshot
                ? "Không có node phù hợp. Thử bỏ bộ lọc hoặc chờ sự kiện hook."
                : "Đang đọc dữ liệu graph…"}
            </p>
          )}
        </div>
        <aside
          className="min-w-0 space-y-5 rounded-lg border border-border p-4 xl:w-72 xl:shrink-0"
          aria-label="Bộ lọc và chi tiết node"
        >
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              Nhóm node
            </h3>
            {networkKinds.map((kind) => (
              <label key={kind.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={kinds.has(kind.id)}
                  onChange={() =>
                    setKinds((old) => {
                      const next = new Set(old);
                      if (next.has(kind.id)) next.delete(kind.id);
                      else next.add(kind.id);
                      return next;
                    })
                  }
                />
                <svg width="10" height="10" aria-hidden="true">
                  <circle cx="5" cy="5" r="4" fill={kind.color} />
                </svg>
                <span className="flex-1">{kind.label}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {network.nodes.filter((node) => node.kind === kind.id).length}
                </span>
              </label>
            ))}
            <label className="flex items-center gap-2 border-t border-border pt-3 text-sm">
              <input
                type="checkbox"
                checked={hideIsolated}
                onChange={(event) => setHideIsolated(event.target.checked)}
              />
              Ẩn node chưa có cạnh
            </label>
          </div>
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase text-muted-foreground">
              {current ? "Node đang chọn" : "Liên kết nhiều nhất"}
            </h3>
            {current ? (
              <>
                <p className="break-all text-sm font-medium">{current.label}</p>
                <Badge variant="outline">{current.state}</Badge>
                <p className="break-all text-xs text-muted-foreground">
                  {current.detail}
                </p>
                {current.kind === "tool" && (
                  <GortexShellPreview preview={current.preview} />
                )}
                <p className="text-xs text-muted-foreground">
                  {adjacent.length} quan hệ quan sát được
                </p>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {adjacent.map((edge) => {
                    const other = network.nodes.find(
                      (node) =>
                        node.id ===
                        (edge.from === current.id ? edge.to : edge.from),
                    );
                    return (
                      other && (
                        <li key={edge.from + edge.to}>
                          <button
                            className="w-full space-y-1 text-left hover:text-primary"
                            onClick={() => setSelected(other.id)}
                          >
                            <p className="break-all text-xs">{other.label}</p>
                            {other.preview?.command && (
                              <p className="line-clamp-2 break-all text-xs text-muted-foreground">
                                {other.preview.command}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {edge.label}
                            </p>
                          </button>
                        </li>
                      )
                    );
                  })}
                </ul>
              </>
            ) : (
              <ul className="space-y-3">
                {[...network.nodes]
                  .map((node) => ({
                    node,
                    degree: network.edges.filter(
                      (edge) => edge.from === node.id || edge.to === node.id,
                    ).length,
                  }))
                  .sort((a, b) => b.degree - a.degree)
                  .slice(0, 8)
                  .map(({ node, degree }) => (
                    <li key={node.id}>
                      <button
                        onClick={() => setSelected(node.id)}
                        className="flex w-full items-start justify-between gap-2 text-left text-xs hover:text-primary"
                      >
                        <span className="min-w-0 break-all">{node.label}</span>
                        <span className="shrink-0 text-muted-foreground">
                          {degree}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Chọn node để xem quan hệ. Graph giới hạn 12 phiên, 6 tool mỗi phiên
            và 30 run gần nhất. Không suy diễn function runtime từ cạnh này.
          </p>
        </aside>
      </div>
    </section>
  );
}
