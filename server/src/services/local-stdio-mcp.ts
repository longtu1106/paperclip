import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";

export const LOCAL_MCP_IDLE_TTL_MS = 5 * 60_000;

export interface LocalMcpScope {
  companyId: string;
  connectionId: string;
  agentId: string | null;
  runId: string | null;
  sessionId: string;
}

export function localMcpScopeKey(scope: LocalMcpScope): string {
  return JSON.stringify([scope.companyId, scope.connectionId, scope.agentId,
    scope.runId ? ["run", scope.runId] : ["session", scope.sessionId]]);
}

export class LocalMcpError extends Error {
  constructor(public readonly reasonCode: string, message: string) { super(message); }
}

interface RetainedClient {
  scope: LocalMcpScope;
  sessionIds: Set<string>;
  fingerprint: string;
  client: Client;
  transport: StdioClientTransport;
  ready: Promise<void>;
  tail: Promise<void>;
  users: number;
  closed: boolean;
  closing?: Promise<void>;
  idleTimer?: ReturnType<typeof setTimeout>;
  expiryTimer?: ReturnType<typeof setTimeout>;
}

/** Process-wide retention: gateway service objects may be recreated per request.
 * Authorization and credential resolution must still happen before every call.
 * Never replay a failed request: a timed-out browser action may already have run.
 */
export function createLocalMcpPool(idleTtlMs = LOCAL_MCP_IDLE_TTL_MS) {
  const clients = new Map<string, RetainedClient>();

  function close(entry: RetainedClient): Promise<void> {
    if (entry.closed) return entry.closing ?? Promise.resolve();
    entry.closed = true;
    clearTimeout(entry.idleTimer);
    clearTimeout(entry.expiryTimer);
    const key = localMcpScopeKey(entry.scope);
    if (clients.get(key) === entry) clients.delete(key);
    entry.closing = entry.client.close().catch(() => undefined);
    return entry.closing;
  }

  async function closeMatching(matches: (scope: LocalMcpScope, sessionIds: Set<string>) => boolean) {
    await Promise.all([...clients.values()]
      .filter(entry => matches(entry.scope, entry.sessionIds)).map(close));
  }

  return {
    async request(input: {
      scope: LocalMcpScope;
      command: string;
      args: string[];
      env: NodeJS.ProcessEnv;
      method: string;
      params: Record<string, unknown>;
      timeoutMs: number;
      expiresAt: Date;
      onProcess?: (pid: number | null) => void;
    }): Promise<unknown> {
      if (input.expiresAt.getTime() <= Date.now()) {
        throw new LocalMcpError("session_expired", "Local MCP session has expired");
      }
      const key = localMcpScopeKey(input.scope);
      // Only a digest is retained; credentials never become cache keys or logs.
      const fingerprint = createHash("sha256").update(JSON.stringify([
        input.command, input.args, Object.entries(input.env).sort(([a], [b]) => a.localeCompare(b)),
      ])).digest("hex");
      let entry = clients.get(key);
      let retired = Promise.resolve();
      if (entry && entry.fingerprint !== fingerprint) {
        retired = close(entry);
        entry = undefined;
      }
      if (!entry) {
        const transport = new StdioClientTransport({
          command: input.command, args: input.args,
          env: Object.fromEntries(Object.entries(input.env).filter((row): row is [string, string] => row[1] !== undefined)),
          stderr: "pipe", maxBufferSize: 16 * 1024 * 1024,
        });
        // Drain diagnostics without retaining or publishing provider credentials.
        transport.stderr?.on("data", () => {});
        const client = new Client({ name: "paperclip-tool-gateway", version: "0.3.1" }, { capabilities: {} });
        const created: RetainedClient = {
          scope: input.scope, sessionIds: new Set(), fingerprint, client, transport,
          ready: Promise.resolve(), tail: Promise.resolve(), users: 0, closed: false,
        };
        entry = created;
        clients.set(key, created);
        client.onclose = () => { void close(created); };
        client.onerror = () => { void close(created); };
        created.ready = retired.then(() => {
          if (created.closed) throw new LocalMcpError("local_stdio_process_exited", "Local MCP session was closed");
          return client.connect(transport, { timeout: input.timeoutMs });
        });
        // A queued caller will observe the failure; do not leak a rejection while
        // it waits for an earlier operation in the same scope.
        void created.ready.catch(() => close(created));
      }
      const retained = entry;
      retained.sessionIds.add(input.scope.sessionId);
      retained.users++;
      clearTimeout(retained.idleTimer);
      clearTimeout(retained.expiryTimer);
      retained.expiryTimer = setTimeout(() => { void close(retained); },
        Math.min(2_147_483_647, input.expiresAt.getTime() - Date.now()));
      retained.expiryTimer.unref();
      const previous = retained.tail;
      let release!: () => void;
      retained.tail = new Promise<void>(resolve => { release = resolve; });
      let timeoutTimer!: ReturnType<typeof setTimeout>;
      const deadline = new Promise<never>((_resolve, reject) => {
        timeoutTimer = setTimeout(() => reject(new LocalMcpError("tool_timeout", "Local stdio MCP tool call timed out")), input.timeoutMs);
        timeoutTimer.unref();
      });
      let initialized = false;
      try {
        await Promise.race([previous.then(() => retained.ready), deadline]);
        if (retained.closed) throw new LocalMcpError("local_stdio_process_exited", "Local MCP session was closed");
        initialized = true;
        input.onProcess?.(retained.transport.pid);
        return await Promise.race([
          retained.client.request({ method: input.method, params: input.params }, z.unknown(), { timeout: input.timeoutMs }),
          deadline,
        ]);
      } catch (error) {
        const code = (error as { code?: unknown })?.code;
        // Valid JSON-RPC errors (e.g. unsupported optional resources) do not
        // mean that a healthy browser transport should be discarded.
        if (!initialized || retained.closed || error instanceof LocalMcpError || code === -32001 || code === -32700) await close(retained);
        if (error instanceof LocalMcpError) throw error;
        throw new LocalMcpError(code === -32001 ? "tool_timeout" : "local_stdio_protocol_error",
          code === -32001 ? "Local stdio MCP tool call timed out" : "Local stdio MCP session failed");
      } finally {
        clearTimeout(timeoutTimer);
        retained.users--;
        release();
        if (!retained.closed && retained.users === 0) {
          retained.idleTimer = setTimeout(() => { void close(retained); }, idleTtlMs);
          retained.idleTimer.unref();
        }
      }
    },
    closeMatching,
    closeAll: () => closeMatching(() => true),
    get size() { return clients.size; },
  };
}

export const localMcpPool = createLocalMcpPool();
