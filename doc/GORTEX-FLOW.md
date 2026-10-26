# Gortex Flow (local)

Open `http://localhost:3100/LON/gortex-flow` on this machine, or choose **Gortex Flow** in either Paperclip sidebar. The company prefix changes on another installation.

## Current default: metadata-only hooks

The optimized advisory adapter sends local policy only at SessionStart (including resume/compact) and configured SubagentStart boundaries. Its PostCompact callback also supports policy if a host explicitly configures that event. Ordinary PreToolUse/PostToolUse/UserPromptSubmit/Stop callbacks return empty JSON and do not spawn Gortex enrichment or inject full context. The collector still writes allowlisted local metadata and marks enrichment `skipped`; the UI shows “chỉ metadata · không gọi enrichment”. Explicit MCP graph tools remain enabled and their results have normal model context costs when requested.

Existing command definitions, MCP settings and native hook trust are preserved when replacing the known adapter script. Codex currently inherits policy through shared AGENTS for subagents without a separate installed SubagentStart handler; Claude already has that handler. This optimization does not add hook definitions or self-grant trust. Old context already in an open conversation remains until the host compacts it; the next callback uses the new script.

Reference-token comparison of the retained old adapter and installed optimized adapter, with no model calls: one startup + one prompt + 50 tool pairs changes newly inserted fallback context from 19,384 to 295 `o200k_base` reference tokens (98.48% less hook text). This is not a total model-usage, billing or quota reduction claim. Historical events retain their prior enrichment status.

The default **Graph** view follows the supplied knowledge-graph reference: large interactive canvas, search, zoom/pan, draggable nodes, category filters, label modes and a right-hand relationship inspector. Workspace/repo edges come from the registry; session/tool/run edges require observed data. A pulsing ring marks an observed running node. The graph is bounded to 12 sessions, six recent tools per session and 30 company runs.

Session nodes and flow cards show the existing local chat name when available, with an opaque ID fallback for unnamed sessions. Paperclip reads Codex `session_index.jsonl` title metadata and bounded Claude `custom-title`/`ai-title`/`summary` metadata for sessions already observed by the collector. It caches lookup for ten seconds, keeps hashed correlation IDs, and never generates a title from prompts or calls an AI model. Names are added to the local-only API response; hook definitions and the spool format stay unchanged.

**Luồng chạy** describes configured hook connections and the observed source → session → tool graph with an event timeline. Counts confirm events actually received; a configured connection alone does not confirm a live client. The page polls every two seconds while visible; Pause freezes automatic refresh, and Refresh remains available. Repo cards filter sessions by checkout path.

Desktop/CLI hooks and native Paperclip run data are separate evidence sources. The device hook stream is instance-wide. Paperclip live runs use the selected company's existing authorized API. The page is restricted to a loopback connection with the local implicit board actor in `local_trusted` mode; authenticated deployments, agents and remote callers cannot read device metadata. This local feature is not a multi-user hosted telemetry service.

## Install on another machine

1. Apply the advisory fallback setup first (the Gortex upgrade/fallback kit). Keep independent security hooks enabled. Do not track a parent or temporary chat folder to make this page work.
2. Apply the accompanying Paperclip patch after checking its base and preserving local changes. It adds the API, collector, UI and regression tests. Run `pnpm install --prod=false --frozen-lockfile` with the repository's configured pnpm and Node 24.11+ to include UI development tools. No DB migration is required.
3. First apply the optimized advisory fallback kit, then from the Paperclip checkout run `node scripts/install-gortex-flow.mjs`. It verifies metadata-only mode, backs up and extends only the known advisory adapter, and installs `~/.gortex-flow/hook-events.cjs`. Use `--adapter <absolute path>` if the adapter is elsewhere. Run from an environment where Gortex sees the intended registry. The installer refuses a legacy enrichment adapter rather than silently restore its repeated context.
4. The installer copies only absolute `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` and `GORTEX_BINARY` paths into `~/.gortex-flow/config.json`. This lets Paperclip use the selected Gortex registry without weakening its Windows environment allowlist or copying provider credentials. Set these paths explicitly on a new computer; do not copy this machine's E: paths blindly.
5. Ensure the Gortex adapter's **PostToolUse** matcher covers all tools: `.*` in Codex, `*` in Claude Code. Preserve other handlers and native trust state. Codex requires reviewing a modified hook definition in `/hooks`; do not manufacture `trusted_hash` entries or disable trust checks. The installer deliberately does not edit the host's trust/config definitions.
6. Restart/reload the owned Paperclip server with its normal supervisor after checking live runs. On this Windows checkout use Node 24.11+ with `scripts/windows-local.mjs stop` then `start`. Reopen the page; the health endpoint and `/api/local/gortex-flow` should respond.

An existing host that already loaded the same wrapper command uses updated wrapper code on its next invocation. A host still using an old hook definition needs its supported hook/config refresh. If the fallback installer or `gortex install` later replaces the adapter, rerun the flow installer afterward.

## Reload MCP in the current conversation

- Codex app-server provides `config/mcpServer/reload`: reload configuration from disk and queue refresh for loaded threads. A client must send it on its connection to the **same running app-server**. Starting another app-server and calling reload does not refresh Codex Desktop's process. This dashboard does not impersonate that connection and has no fake “Reload Desktop MCP” button.
- This chat currently exposes no supported handle for sending that request to Desktop. Use the host's reconnect/refresh action if present. If the host requires an application restart, resume the existing conversation afterward; creating a separate conversation is not the intended recovery. Local CLI/registry fallback remains usable meanwhile.
- Reloading MCP config does not change a conversation's working directory. This chat starts in a temporary Documents/Codex directory, so Gortex can remain INACTIVE there even after a refresh. Use the actual tracked checkout/exact view or CLI `--index` for source queries; never track the temporary directory to clear that message.
- In interactive Claude Code, open `/mcp`, select the server and **Reconnect**. Desktop Code, ordinary Claude chat and Cowork have different runtimes; CLI hooks are not automatically available in every mode. Verify actual events before relying on the connection.
- Local shell hooks are not a complete audit boundary. Hosted tools or cloud-orchestrated chats may not emit these local callbacks even when their file tools run on the same computer.

Sources: [Codex app-server](https://learn.chatgpt.com/docs/app-server), [Codex hooks and native trust](https://learn.chatgpt.com/docs/hooks), [Claude Code MCP reconnect](https://code.claude.com/docs/en/mcp).

## Meaning and limits

- `PreToolUse` starts an observed tool node. `PostToolUse` means returned, not proven successful. Explicit supported failure events are labelled failed. Events with missing correlation IDs are never paired by name.
- Unfinished tools become unknown after five minutes or a stop. This does not terminate the tool. A long-running command may later return and update the node.
- Historical enrichment “responded” only means the advisory command exited successfully. It does not prove exact/fresh graph availability. New `skipped` events intentionally use metadata-only mode without calling enrichment; this is not an error. Gortex errors on explicitly requested graph tools still permit filesystem fallback.
- Graph coverage reads the local YAML repository registry, cached for 30 seconds; it never opens the graph store or waits for the daemon. Freshness is explicitly unverified. An explicit XDG registry is never silently substituted with another one. Code-symbol callers/callees and application function execution are not inferred from tool events.
- Local source labels intentionally do not guess desktop versus independent CLI. Paperclip is identified only when its process environment supplies `PAPERCLIP_RUN_ID`; its existing live-run API remains useful when managed CLI homes lack hooks.
- Raw prompts and tool payloads are never persisted. By default, command/output content is omitted. With the user-approved captureShellPreview opt-in, recognized shell tools store only bounded command/output excerpts and optional integer exit code; known credential patterns are redacted. This is best-effort pattern filtering, not a complete DLP guarantee. Session/call IDs remain hashed; CWD paths and tool names are local metadata. The collector exposes no network listener.
- The collector caps each UTC day's spool at 16 MiB and removes its own dated files older than seven days on the next write. Reads are bounded to 512 KiB per current/previous day and the most recent 1,000 valid events. Very busy sessions can lose older events; incomplete views must remain unknown.
- Set `GORTEX_FLOW_DISABLED=1` for a host process to stop optional capture while keeping the advisory adapter. Collection failure never changes adapter stdout, permission decisions or exit status.

## Rollback

Remove the optional marked `gortex-flow:start`/`gortex-flow:end` CLI block using the adapter backup, or restore the precise pre-install adapter. Reverse only the supplied Paperclip patch after checking for subsequent edits. Restore only the two backed-up Gortex matcher definitions if desired. Keep independent hooks and unrelated changes. Do not remove the Gortex graph store, tracked repos, database or unrelated user data.

## Graph appearance

The graph uses a lazy-loaded local bundle of [3d-force-graph](https://github.com/vasturiano/3d-force-graph) with Three.js/WebGL. Sessions are anchored in a central3D sphere; tools and infrastructure settle farther out. Drag the background to rotate, use the wheel or zoom buttons, and reset the layout/camera with the center control. Existing node positions and camera survive ordinary metadata polling.

Glowing category spheres and curved particle connections are rendered in the browser. Particles emphasize selection/observed running relationships, not measured packet transmission. The graph has its own particle toggle and honors reduced motion. This increases browser download/GPU work and introduces no AI request or expanded hook payload. Native node selection remains available for keyboard use and if WebGL is unavailable. Hidden tabs pause rendering; unmount releases graphics resources.

## Optional shell previews

Install/update the local collector with `node scripts/install-gortex-flow.mjs --shell-preview` only when the user requests command/output previews. This sets captureShellPreview=true in ~/.gortex-flow/config.json; without that explicit flag, default behavior remains metadata-only and existing settings are preserved. Set captureShellPreview=false to stop new snippets without stopping ordinary metadata capture. Existing bounded spool retention remains7days.

Bash/supported terminal calls use titles such as `Bash · 11:27:44 · Đã trả về`. The graph inspector and flow view show up to200command characters and400output characters, plus exit code when actually reported. Missing exit code does not imply success. Raw tool inputs/responses and prompts are discarded. Known key/token/password/authorization/cookie/JWT/private-key patterns and credential-file reads are suppressed/redacted; arbitrary sensitive content cannot be completely recognized by patterns. Historical command content is not backfilled from chat logs. No snippets are returned as hook additionalContext, and no enrichment/model call is added.
