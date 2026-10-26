import { describe, expect, it } from "vitest";
import type { FlowSnapshot } from "../api/gortex-flow";
import { buildNetwork, networkLayout3D } from "./gortex-network";

const snapshot: FlowSnapshot = {
  at: new Date().toISOString(),
  scope: "local-device",
  collectorInstalled: true,
  events: [],
  inventory: {
    source: "config",
    error: "CLI unavailable",
    checkedAt: new Date().toISOString(),
    repos: [
      {
        name: "cshub",
        path: "E:/Projects/vng/cshub",
        workspace: "vng",
        branch: null,
        indexed: null,
        stale: null,
      },
      {
        name: "paperclip",
        path: "E:/Projects/vng/paperclip",
        workspace: null,
        branch: null,
        indexed: null,
        stale: null,
      },
    ],
  },
};
describe("observed Gortex network", () => {
  it("labels session nodes with the chat title while keeping the opaque graph key", () => {
    const titled = {
      ...snapshot,
      events: [
        {
          id: "title-event",
          at: new Date().toISOString(),
          agent: "codex" as const,
          source: "local" as const,
          session: "opaque-session",
          sessionTitle: "Tên cuộc trò chuyện",
          call: null,
          tool: null,
          cwd: null,
          event: "SessionStart",
          enrich: "ok" as const,
          companyId: null,
          runId: null,
        },
      ],
    };
    const node = buildNetwork(titled).nodes.find(
      (node) => node.kind === "session",
    );
    expect(node?.label).toBe("Tên cuộc trò chuyện");
    expect(node?.id).toContain("opaque-session");
  });
  it("shows configured membership and invents no runtime when hooks are absent", () => {
    const network = buildNetwork(snapshot);
    expect(network.nodes.map((node) => node.kind)).toEqual([
      "repo",
      "workspace",
      "repo",
    ]);
    expect(network.edges).toEqual([
      {
        from: "workspace:vng",
        to: "repo:E:/Projects/vng/cshub",
        label: "workspace chứa repo",
      },
    ]);
    expect(network.nodes.some((node) => node.running)).toBe(false);
  });
  it("links observed tools and uses checkout boundaries instead of repo name prefixes", () => {
    const observed = {
      ...snapshot,
      events: [
        {
          id: "1",
          at: new Date().toISOString(),
          agent: "codex" as const,
          source: "local" as const,
          session: "s",
          call: "t",
          tool: "Bash",
          cwd: "E:/Projects/vng/cshub-other",
          event: "PreToolUse",
          enrich: "ok" as const,
          companyId: null,
          runId: null,
        },
      ],
    };
    const network = buildNetwork(observed);
    expect(
      network.nodes.filter((node) => node.running).map((node) => node.kind),
    ).toEqual(["session", "tool"]);
    expect(
      network.edges.some((edge) => edge.label === "CWD nằm trong repo"),
    ).toBe(false);
    expect(
      network.edges.every(
        (edge) =>
          network.nodes.some((node) => node.id === edge.from) &&
          network.nodes.some((node) => node.id === edge.to),
      ),
    ).toBe(true);
    const positions = networkLayout3D(network);
    for (const node of network.nodes.filter(
      (node) => node.kind === "session",
    )) {
      const { x, y, z } = positions[node.id];
      expect(Math.hypot(x, y, z)).toBeLessThanOrEqual(105.00001);
    }
    expect(networkLayout3D({ nodes: [], edges: [] })).toEqual({});
    for (const point of Object.values(networkLayout3D(network))) {
      expect(
        Number.isFinite(point.x) &&
          Number.isFinite(point.y) &&
          Number.isFinite(point.z),
      ).toBe(true);
      expect(Math.hypot(point.x, point.y, point.z)).toBeLessThanOrEqual(
        325.00001,
      );
      expect(networkLayout3D(network)).toEqual(networkLayout3D(network));
    }
  });
});
