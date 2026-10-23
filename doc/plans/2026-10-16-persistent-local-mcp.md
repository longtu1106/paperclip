# Persistent local MCP sessions — 2026-10-16

Problem: the gateway spawns, initializes and kills a local stdio server on every operation. Playwright loses its selected page between navigate/snapshot/click. Runtime slots currently describe simulated process lifetimes.

Plan: reuse an SDK stdio client for a company/connection/agent/run scope (session scope for calls without a run), serialize operations in that scope, invalidate on credential/command changes, close on timeout/transport failure without replay, and retain healthy clients between calls. Bound retention by idle TTL and authenticated session expiry. Run token revocation closes its processes; session revocation and runtime stop/restart also close retained clients. Existing authorization and secret resolution still precede each invocation. Keep Cognee HTTP behavior unchanged.

Verification: real stdio child-process regression tests for state reuse, owner separation, concurrency, credential rotation, idle expiry, process failure, timeout and explicit cleanup; targeted gateway/supervisor checks; live health and repeated MCP protocol calls after a controlled restart. Browser UI observation is unavailable while Work browser control is disabled. Separate process scopes do not create separate Chrome profiles; agents can still deliberately select shared browser tabs.

Task investigation: LON-7 is in_review, assigned to Culi 3. LON-6/Culi 4 is blocked on children, including LON-7. Preserve review gates and task state; implementation completion is not final acceptance.

## Implementation and verification

- Added SDK-backed process-wide pool in server/src/services/local-stdio-mcp.ts. Scope includes company/connection/agent/run; runless clients use gateway session ID. Command/environment digest invalidates rotated credentials without logging values. Calls are serialized with deadlines covering queue wait as well as execution. Valid JSON-RPC errors preserve a healthy transport; timeout/transport failure never replay an operation.
- Gateway records real PIDs and uses scoped runtime slot keys. Revocation/expiry, runtime controls, heartbeat run-token cleanup and server shutdown close retained clients. Run cleanup also stops its database runtime slots and records activity. Default gateway idle TTL is five minutes with 16 company / 64 host slots; explicit supervisor options win.
- E:/Projects/vng/tests/paperclip/local-stdio-mcp.test.ts: 11/11 real-process lifecycle tests passed. Existing windows-local tests: 13/13 passed.
- Existing gateway suite: 83/83 passed. Extended its local stdio case to prove PID reuse and run-end slot cleanup; targeted rerun passed (1 passed, 82 deliberately filtered out).
- Real installed Playwright Vision Proxy: tools/list returned 30 tools on three calls. Same-agent calls used PID 62932 twice; other-agent scope used PID 51172. Explicit cleanup left zero retained clients and both processes exited. This verifies protocol/process retention, not rendered browser behavior.
- Heartbeat runtime MCP suite was attempted twice; its embedded PostgreSQL beforeAll timed out at its explicit 20-second limit, so its 12 cases did not execute. Gateway's longer database setup completed successfully.
- Server typecheck remains blocked by existing missing @paperclipai/paperclip-runner declarations and downstream implicit-any errors; no diagnostics in changed production files or the extended gateway test. Prettier is not installed in this checkout; no formatter dependency was added. git diff --check passed.
- Controlled restart backup: data/windows-backups/2026-10-16T14-28-52-771Z-ced15c. Agent task/review state was not changed.
- Applied server PID 41396: health ok, executionEnabled true. Post-restart company gateway Gortex capabilities call returned HTTP 200, decision allowed, result present. Browser interaction itself was not exercised because browser control is disabled in Work settings.
- LON-7 execution state is pending at its review stage with Culi 3 as current participant; no completed review decision is recorded. Culi 3 has periodic heartbeat disabled, but its default event-driven wakeOnDemand remains enabled: the disabled timer alone does not prove why the review has not started. No agent was forcibly woken and no review was bypassed.
- Gortex navigation/impact were used, then filesystem fallback after mutation receipt mutation-118 left the exact graph stale. Post-edit graph guards/contracts could not run against that stale view.
