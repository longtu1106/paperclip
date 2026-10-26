import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Pause, Play, RefreshCw } from "lucide-react";
import { gortexFlowApi } from "../api/gortex-flow";
import { flowSessions, pathContains } from "../lib/gortex-flow";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card } from "../components/ui/card";
import { Link } from "@/lib/router";
import { GortexSessionDetail } from "../components/GortexSessionDetail";
import { GortexIngressMap } from "../components/GortexIngressMap";
import { GortexTopology } from "../components/GortexTopology";
import { GortexRepoCoverage } from "../components/GortexRepoCoverage";
import { GortexNetwork } from "../components/GortexNetwork";

const clock = (value: string) => new Date(value).toLocaleTimeString();

export function GortexFlow() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [paused, setPaused] = useState(false);
  const [mode, setMode] = useState<"graph" | "flow">("graph");
  const [source, setSource] = useState("all");
  const [repo, setRepo] = useState("");
  const [selected, setSelected] = useState("");
  const [toolId, setToolId] = useState("");
  useEffect(() => {
    setBreadcrumbs([{ label: "Gortex Flow" }]);
  }, [setBreadcrumbs]);
  const snapshot = useQuery({
    queryKey: ["gortex-flow", "device"],
    queryFn: gortexFlowApi.snapshot,
    refetchInterval: paused ? false : 2000,
    refetchOnWindowFocus: !paused,
    refetchOnReconnect: !paused,
    retry: false,
  });
  const runs = useQuery({
    queryKey: ["gortex-flow", "runs", selectedCompanyId],
    queryFn: () => gortexFlowApi.runs(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: paused ? false : 2000,
    refetchOnWindowFocus: !paused,
    refetchOnReconnect: !paused,
    retry: false,
  });
  const sessions = useMemo(
    () =>
      flowSessions(snapshot.data?.events ?? []).filter(
        (session) =>
          (source === "all" ||
            (source === "paperclip"
              ? session.source === "paperclip"
              : session.agent === source)) &&
          (!repo || pathContains(repo, session.cwd)),
      ),
    [snapshot.data, source, repo],
  );
  const current =
    sessions.find((session) => session.id === selected) ?? sessions[0];
  const active = sessions
    .flatMap((session) => session.tools)
    .filter((tool) => tool.state === "running");
  const inventory = snapshot.data?.inventory;
  const refresh = () => {
    void snapshot.refetch();
    void runs.refetch();
  };
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-primary" />
            <h1 className="text-2xl font-semibold">Gortex Flow</h1>
            <Badge variant="outline">Local device</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Theo dõi hook Codex / Claude và agent Paperclip. Chọn phiên để xem
            tool và sự kiện.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setPaused(!paused)}>
            {paused ? <Play /> : <Pause />}
            {paused ? "Tiếp tục" : "Tạm dừng"}
          </Button>
          <Button
            variant="outline"
            aria-label="Làm mới dữ liệu"
            onClick={refresh}
          >
            <RefreshCw className={snapshot.isFetching ? "animate-spin" : ""} />
          </Button>
        </div>
      </header>
      {snapshot.error && (
        <Card className="p-4 text-sm text-destructive" role="alert">
          Không đọc được collector: {snapshot.error.message}. Dashboard này chỉ
          dành cho board trên máy local.
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "Tool đang chạy", value: active.length },
          { label: "Phiên có sự kiện", value: sessions.length },
          { label: "Repo đã track", value: inventory?.repos.length ?? "—" },
        ].map((metric) => (
          <Card className="gap-2 p-4" key={metric.label}>
            <span className="text-sm text-muted-foreground">
              {metric.label}
            </span>
            <span className="text-3xl font-semibold tabular-nums">
              {metric.value}
            </span>
          </Card>
        ))}
      </div>
      <div
        className="flex items-center gap-2"
        role="group"
        aria-label="Chế độ hiển thị"
      >
        <Button
          variant={mode === "graph" ? "default" : "outline"}
          onClick={() => setMode("graph")}
        >
          Graph
        </Button>
        <Button
          variant={mode === "flow" ? "default" : "outline"}
          onClick={() => setMode("flow")}
        >
          Luồng chạy
        </Button>
      </div>
      {mode === "graph" && (
        <GortexNetwork snapshot={snapshot.data} runs={runs.data ?? []} />
      )}
      {mode === "flow" && (
        <section className="space-y-3" aria-labelledby="flow-heading">
          {!snapshot.error && !snapshot.isPending && (
            <GortexIngressMap
              events={snapshot.data?.events ?? []}
              installed={snapshot.data?.collectorInstalled ?? false}
              source={source}
              onSelectSource={(value) => {
                setSource(value);
                setSelected("");
                setToolId("");
              }}
            />
          )}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 id="flow-heading" className="text-lg font-semibold">
                Luồng sự kiện
              </h2>
              <p className="text-xs text-muted-foreground">
                Dữ liệu hook của thiết bị · không lưu prompt, command hoặc nội
                dung tool.
              </p>
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Nguồn
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setSelected("");
                  setToolId("");
                }}
              >
                <option value="all">Tất cả nguồn</option>
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="paperclip">Paperclip CLI</option>
              </select>
            </label>
          </div>
          {snapshot.error ? null : snapshot.isPending ? (
            <Card className="p-6 text-sm text-muted-foreground" role="status">
              Đang đọc sự kiện local…
            </Card>
          ) : !current ? (
            <Card className="gap-3 p-6">
              <Activity className="size-6 text-muted-foreground" />
              <p className="font-medium">Chưa nhận sự kiện phù hợp</p>
              <p className="text-sm text-muted-foreground">
                {snapshot.data?.collectorInstalled
                  ? "Collector đã cài nhưng chưa nhận hook phù hợp. Client cần nạp và cho phép hook; Codex có thể yêu cầu review trong /hooks. Kết nối MCP không tự tạo sự kiện hook."
                  : "Collector chưa được cài trên máy này. Xem hướng dẫn Gortex Flow trong docs để nối adapter advisory hiện có."}
              </p>
            </Card>
          ) : (
            <>
              <GortexTopology
                session={current}
                selectedTool={toolId}
                onSelectTool={setToolId}
              />
              <GortexSessionDetail
                sessions={sessions}
                current={current}
                toolId={toolId}
                setSelected={setSelected}
                setToolId={setToolId}
              />
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Luồng trên thể hiện sự kiện agent/tool, không phải function đang
            thực thi trong ứng dụng. “Local” có thể là desktop hoặc CLI; hook
            không tự chứng minh được giao diện nguồn.
          </p>
        </section>
      )}
      <section className="space-y-3" aria-labelledby="paperclip-heading">
        <h2 id="paperclip-heading" className="text-lg font-semibold">
          Paperclip · run của tổ chức đang chọn
        </h2>
        {runs.error ? (
          <p className="text-sm text-destructive" role="alert">
            Không đọc được run: {runs.error.message}
          </p>
        ) : runs.isPending && selectedCompanyId ? (
          <p className="text-sm text-muted-foreground">Đang đọc run…</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {runs.data?.length ? (
              runs.data.map((run) => (
                <Link
                  key={run.id}
                  to={`/agents/${run.agentId}/runs/${run.id}`}
                  className="min-w-0 rounded-md border border-border p-3 text-sm hover:bg-accent"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{run.agentName}</span>
                    <Badge variant="outline">{run.status}</Badge>
                  </div>
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    {run.adapterType} · {run.id.slice(0, 8)}
                  </p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {selectedCompanyId
                  ? "Không có run đang chạy hoặc chờ. Không kích hoạt agent để tạo dữ liệu minh họa."
                  : "Chọn tổ chức để xem run."}
              </p>
            )}
          </div>
        )}
      </section>
      <GortexRepoCoverage
        inventory={inventory}
        repo={repo}
        setRepo={(value) => {
          setRepo(value);
          setSelected("");
          setToolId("");
          setMode("flow");
        }}
      />
      <footer className="space-y-1 text-xs text-muted-foreground">
        <p>
          {paused
            ? "Đã tạm dừng tự cập nhật"
            : "Cập nhật mỗi 2 giây khi tab đang mở"}{" "}
          ·{" "}
          {snapshot.data
            ? `Lần đọc ${clock(snapshot.data.at)}`
            : "Chưa có snapshot"}
        </p>
        <p>
          Hiện tối đa 1.000 sự kiện trong hôm nay và hôm qua. Hook luôn
          advisory; collector lỗi vẫn cho phép thao tác filesystem đã được cho
          phép.
        </p>
      </footer>
    </div>
  );
}
