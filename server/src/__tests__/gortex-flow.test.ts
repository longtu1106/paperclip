import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Request } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { assertLocalFlowAccess } from "../routes/gortex-flow.js";
import { parseFlowRepos } from "../services/gortex-flow.js";

const require = createRequire(import.meta.url);
const {
  metadata,
  record,
  readEvents,
} = require("../../../scripts/gortex-flow-events.cjs");
const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0))
    fs.rmSync(dir, { recursive: true, force: true });
});
const payload = {
  hook_event_name: "PreToolUse",
  session_id: "secret-session",
  tool_use_id: "call-a",
  tool_name: "Bash",
  cwd: process.cwd(),
  prompt: "secret prompt",
  tool_input: { command: "SECRET_TOKEN=value" },
  tool_response: "secret output",
};

describe("local hook event collector", () => {
  it("persists metadata only and hashes correlation identifiers", () => {
    const item = metadata(payload, "codex", "ok", {});
    expect(item.session).toMatch(/^[a-f0-9]{24}$/);
    expect(item.call).not.toBe("call-a");
    expect(JSON.stringify(item)).not.toMatch(
      /secret|SECRET|command|prompt|tool_input|tool_response/,
    );
    expect(item.tool).toBe("Bash");
    expect(item.source).toBe("local");
  });
  it("identifies Paperclip only from the hook process environment", () => {
    const item = metadata(
      { ...payload, source: "paperclip", runId: "fake" },
      "claude",
      "ok",
      { PAPERCLIP_RUN_ID: "real-run", PAPERCLIP_COMPANY_ID: "company-1" },
    );
    expect(item.source).toBe("paperclip");
    expect(item.runId).toBe("real-run");
    expect(
      metadata({ ...payload, runId: "fake" }, "claude", "ok", {}).source,
    ).toBe("local");
  });
  it("fails open on malformed input and unwritable destinations", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gortex-flow-"));
    temporary.push(dir);
    const file = path.join(dir, "file");
    fs.writeFileSync(file, "x");
    expect(record("{", "codex", "ok", { root: dir })).toBe(false);
    expect(record(payload, "codex", "ok", { root: file })).toBe(false);
    expect(
      record({ ...payload, hook_event_name: "UnknownEvent" }, "codex", "ok", {
        root: dir,
      }),
    ).toBe(false);
  });
  it("reads completed records, ignores malformed lines and unexpected fields", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gortex-flow-"));
    temporary.push(dir);
    const now = new Date("2026-10-23T12:00:00Z");
    expect(
      record(payload, "codex", "unavailable", { root: dir, now, env: {} }),
    ).toBe(true);
    fs.appendFileSync(
      path.join(dir, "events-2026-10-23.jsonl"),
      '{"broken":\n',
    );
    const items = readEvents(dir, now);
    expect(items).toHaveLength(1);
    expect(items[0].enrich).toBe("unavailable");
    expect(items[0]).not.toHaveProperty("tool_input");
    expect(readEvents(path.join(dir, "missing"), now)).toEqual([]);
  });
  it("caps daily writes and prunes only its own expired spool names", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gortex-flow-"));
    temporary.push(dir);
    fs.writeFileSync(path.join(dir, "events-2026-10-01.jsonl"), "old");
    fs.writeFileSync(path.join(dir, "keep.txt"), "keep");
    const file = path.join(dir, "events-2026-10-23.jsonl");
    const fd = fs.openSync(file, "w");
    fs.ftruncateSync(fd, 16 * 1024 * 1024);
    fs.closeSync(fd);
    expect(
      record(payload, "codex", "ok", {
        root: dir,
        now: new Date("2026-10-23T12:00:00Z"),
      }),
    ).toBe(false);
    expect(fs.existsSync(path.join(dir, "events-2026-10-01.jsonl"))).toBe(
      false,
    );
    expect(fs.readFileSync(path.join(dir, "keep.txt"), "utf8")).toBe("keep");
  });
});

describe("local device access", () => {
  const request = (
    address: string,
    type = "board",
    source = "local_implicit",
  ) =>
    ({
      socket: { remoteAddress: address },
      actor: { type, source },
    }) as unknown as Request;
  it("permits local implicit board in local-trusted mode", () => {
    for (const address of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect(() =>
        assertLocalFlowAccess(request(address), "local_trusted"),
      ).not.toThrow();
  });
  it("denies remote sockets, agents and authenticated deployments", () => {
    expect(() =>
      assertLocalFlowAccess(request("10.0.0.1"), "local_trusted"),
    ).toThrow();
    expect(() =>
      assertLocalFlowAccess(request("127.0.0.1", "agent"), "local_trusted"),
    ).toThrow();
    expect(() =>
      assertLocalFlowAccess(
        request("127.0.0.1", "board", "session"),
        "local_trusted",
      ),
    ).toThrow();
    expect(() =>
      assertLocalFlowAccess(request("127.0.0.1"), "authenticated"),
    ).toThrow();
  });
  it("only returns the inventory allowlist", () => {
    expect(
      parseFlowRepos(
        JSON.stringify([
          {
            name: "repo",
            path: "/repo",
            workspace: "vng",
            secret: "hidden",
            indexed: true,
          },
        ]),
      ),
    ).toEqual([
      {
        name: "repo",
        path: "/repo",
        workspace: "vng",
        branch: null,
        indexed: true,
        stale: false,
      },
    ]);
    expect(() => parseFlowRepos("{}")).toThrow();
  });
});
