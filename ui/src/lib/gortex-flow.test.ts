import { describe, expect, it } from "vitest";
import type { FlowEvent } from "../api/gortex-flow";
import { flowSessions, pathContains } from "./gortex-flow";
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
