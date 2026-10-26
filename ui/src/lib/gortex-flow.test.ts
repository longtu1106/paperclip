import { describe, expect, it } from "vitest";
import type { FlowEvent } from "../api/gortex-flow";
import { flowSessions, pathContains, sessionDisplayName } from "./gortex-flow";
const base: FlowEvent = {
  id: "1",
  at: "2026-10-23T12:00:00Z",
  event: "PreToolUse",
  agent: "codex",
  source: "local",
  companyId: null,
  runId: null,
  session: "session",
  call: "a",
  tool: "Bash",
  cwd: "/repo",
  enrich: "ok",
};
const now = Date.parse(base.at);
describe("flow correlation", () => {
  it("updates chat labels without changing session identity or tool correlation", () => {
    const original = flowSessions([base], now)[0];
    const named = flowSessions(
      [
        base,
        {
          ...base,
          id: "2",
          event: "PostToolUse",
          sessionTitle: "A named chat",
        },
      ],
      now,
    )[0];
    expect(named.id).toBe(original.id);
    expect(named.tools).toHaveLength(1);
    expect(sessionDisplayName(named)).toBe("A named chat");
    expect(sessionDisplayName(original)).toBe("Phiên session");
  });
  it("keeps parallel calls separate and does not equate return with success", () => {
    const result = flowSessions(
      [
        base,
        { ...base, id: "2", call: "b" },
        { ...base, id: "3", event: "PostToolUse" },
      ],
      now,
    );
    expect(result[0].tools.map((tool) => tool.state)).toEqual([
      "returned",
      "running",
    ]);
  });
  it("never matches missing call IDs by tool name", () => {
    const result = flowSessions(
      [
        { ...base, call: null },
        { ...base, id: "2", call: null, event: "PostToolUse" },
      ],
      now,
    );
    expect(result[0].tools.map((tool) => tool.state)).toEqual([
      "running",
      "returned",
    ]);
  });
  it("marks orphaned or stopped calls unknown and records explicit failure", () => {
    expect(flowSessions([base], now + 300001)[0].tools[0].state).toBe(
      "unknown",
    );
    expect(
      flowSessions([base, { ...base, id: "2", event: "Stop" }], now)[0].tools[0]
        .state,
    ).toBe("unknown");
    expect(
      flowSessions(
        [base, { ...base, id: "2", event: "PostToolUseFailure" }],
        now,
      )[0].tools[0].state,
    ).toBe("failed");
  });
  it("separates agent/source namespaces and unattributed events", () => {
    expect(
      flowSessions(
        [
          base,
          { ...base, id: "2", agent: "claude" },
          { ...base, id: "3", source: "paperclip" },
          { ...base, id: "4", session: null },
          { ...base, id: "5", session: null },
        ],
        now,
      ),
    ).toHaveLength(5);
  });
  it("matches checkout path boundaries and Windows case without merging sibling repos", () => {
    expect(
      pathContains("E:\\Projects\\vng\\cshub", "e:/projects/vng/CSHub/src"),
    ).toBe(true);
    expect(
      pathContains("E:/Projects/vng/cshub", "E:/Projects/vng/cshub-other"),
    ).toBe(false);
    expect(pathContains("/repo", "/Repo/src")).toBe(false);
  });
});

// Pre and Post may carry different preview fields for the same call.
describe("shell preview correlation", () => {
  it("retains the command when completion only contains output", async () => {
    const { flowSessions, toolDisplayName } = await import("./gortex-flow");
    const base = {
      id: "a",
      at: "2026-10-26T04:00:00Z",
      event: "PreToolUse",
      agent: "claude" as const,
      source: "local" as const,
      companyId: null,
      runId: null,
      session: "s",
      call: "c",
      tool: "Bash",
      cwd: null,
      enrich: "skipped" as const,
    };
    const sessions = flowSessions([
      {
        ...base,
        shellPreview: {
          command: "node --version",
          output: null,
          exitCode: null,
          truncated: false,
        },
      },
      {
        ...base,
        id: "b",
        event: "PostToolUse",
        at: "2026-10-26T04:00:01Z",
        shellPreview: {
          command: null,
          output: "v24",
          exitCode: 0,
          truncated: false,
        },
      },
    ]);
    expect(sessions[0].tools[0].preview).toEqual({
      command: "node --version",
      output: "v24",
      exitCode: 0,
      truncated: false,
    });
    expect(toolDisplayName(sessions[0].tools[0])).toContain("Hoàn tất");
  });
});
