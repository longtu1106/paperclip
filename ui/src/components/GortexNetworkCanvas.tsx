import { useEffect, useRef, useState } from "react";
import { LocateFixed, Minus, Pause, Play, Plus } from "lucide-react";
import { Button } from "./ui/button";
import type { Network } from "../lib/gortex-network";
import type { GortexScene, SceneLabels } from "../lib/gortex-scene";

export function GortexNetworkCanvas({
  network,
  selected,
  onSelect,
  labels,
}: {
  network: Network;
  selected: string;
  onSelect: (id: string) => void;
  labels: SceneLabels;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<GortexScene | null>(null);
  const latest = useRef({ network, selected, labels, onSelect });
  latest.current = { network, selected, labels, onSelect };
  const [motion, setMotion] = useState(true);
  const motionRef = useRef(motion);
  motionRef.current = motion;
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    import("../lib/gortex-scene")
      .then(({ createGortexScene }) => {
        if (cancelled || !host.current) return;
        try {
          scene.current = createGortexScene(host.current, (id) =>
            latest.current.onSelect(id),
          );
          const current = latest.current;
          scene.current.update(
            current.network,
            current.selected,
            current.labels,
            motionRef.current,
          );
          setStatus("ready");
        } catch {
          scene.current?.dispose();
          scene.current = null;
          host.current?.replaceChildren();
          setStatus("unavailable");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, [retry]);
  useEffect(() => {
    scene.current?.update(network, selected, labels, motion);
  }, [network, selected, labels, motion]);
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          3D · WebGL · phiên ở trung tâm
        </span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={motion ? "Tắt hiệu ứng graph" : "Bật hiệu ứng graph"}
            aria-pressed={motion}
            onClick={() => setMotion(!motion)}
          >
            {motion ? <Pause /> : <Play />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Phóng to graph"
            disabled={status !== "ready"}
            onClick={() => scene.current?.zoom(0.8)}
          >
            <Plus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Thu nhỏ graph"
            disabled={status !== "ready"}
            onClick={() => scene.current?.zoom(1.25)}
          >
            <Minus />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Căn giữa graph"
            disabled={status !== "ready"}
            onClick={() => scene.current?.fit()}
          >
            <LocateFixed />
          </Button>
        </div>
      </div>
      <div className="relative">
        <div ref={host} className="gortex-webgl-host h-96 w-full sm:h-160" />
        {status !== "ready" && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"
            role="status"
          >
            <p>
              {status === "loading"
                ? "Đang tải không gian 3D…"
                : "Không thể mở graph 3D trên trình duyệt này. Bạn vẫn có thể chọn node bên dưới để xem quan hệ."}
            </p>
            {status === "unavailable" && (
              <Button
                variant="outline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Thử lại graph 3D
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">
          {network.nodes.length} node · {network.edges.length} cạnh · kéo nền để
          xoay · cuộn để zoom
        </p>
        <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          Chọn node
          <select
            aria-label="Chọn node graph"
            className="h-9 min-w-0 max-w-64 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={
              network.nodes.some((node) => node.id === selected) ? selected : ""
            }
            onChange={(event) => onSelect(event.target.value)}
          >
            <option value="">Xem node…</option>
            {network.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
