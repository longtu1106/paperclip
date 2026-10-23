# 2026-10-16: opt-in quota fallback between agents

Only provider quota failures on terminal legacy issue runs trigger fallback. Configure ordered same-company agent IDs in runtimeConfig.quotaFallback.agentIds. Preserve task workspace and durable comments/documents; no claim of transferring model-private context. Prefer different credentials/provider through configured order.

Implementation: recovery sweep before quota wait; choose idle, authenticated, under-budget candidate with no active run and no outstanding quota cooldown; lock and recheck task/source run; use issue service for reassignment to todo with durable handoff comment and activity; normal assigned-todo dispatch is the durable wake backstop. Do not transfer chats, private tasks, reviewer stages or native-owned work. Exhausted candidates retain existing quota reset monitor. Cooldowns are persisted on source runtime config and not cleared by routing. No migration or UI change.

Regression checks: disabled/malformed config, same-company and self guards, paused/busy/budget/auth candidates, credential reuse, cooldown expiry, terminal-source/issue-owner race, repeat-sweep idempotency, all exhausted, preserved workspace. Targeted existing recovery tests and server typecheck. Live failure injection into user task is not authorized; report that integration as NOT_RUN.

## Verification and activation

- 48 focused recovery tests passed (quota classification/policy, pause durability, native routing).
- Direct server TypeScript check: zero errors in changed recovery files; overall check fails with existing missing @paperclipai/paperclip-runner declarations and other unrelated errors. Standard typecheck prerequisite is blocked by stale generated Runner protocol manifest. Full monorepo build/test not run.
- Gortex edits applied; detect could not serve fresh graph, so graph tests/guards/contracts are unavailable. Native diff check passed.
- No simulated provider failure was injected into the live Castrol task; end-to-end ownership-transfer/concurrent-sweeper fault injection remains NOT_RUN. No claim of transferring unsaved model-private context.
- Four-agent preference: Culi1 -> Culi4/Culi3/Culi2; Culi2 -> Culi4/Culi1/Culi3; Culi3 -> Culi4/Culi1/Culi2; Culi4 -> Culi2/Culi1/Culi3. Skip unavailable candidates. Fallback operates only for opted-in terminal legacy in-progress issue runs, not chats, private issues, native-owned runs or active review stages.
- Automatic review rejected stop/backup/start with 'blocked by policy'; old PID7104 remains running. New source is NOT loaded yet.
- Scheduler is currently disabled (executionEnabled=false). Recovery fallback needs the normal execution scheduler enabled after restart. Do not mistake saved agent quotaFallback settings for active failover.
- Activation, when ready: stop profile, offline backup, set `node scripts/windows-local.mjs execution on` while stopped, start profile, then verify health. Execution mode cannot be changed while the server is running. Disable each agent runtimeConfig.quotaFallback.enabled or restore the existing quota reset monitor to roll back.

