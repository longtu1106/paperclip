# Native Windows local profile

User decision, 2026-10-15: `E:\ProjectVNG\paperclip` is the primary maintained fork. Start fresh local state; do not migrate VPS history, DB or credentials. Copy existing custom skill/role instructions and keep the source pullable by the company PC. VPS retirement remains a separate user action.

## Implementation

- Add an explicit loopback-only Windows profile, separate embedded DB port/data directory, local ACL protection, background start/status/graceful stop/offline backup and logon startup shortcut.
- Start the TypeScript server through its exported `startServer` lifecycle and tsx loader. Do not require the experimental Rust Runner merely to run direct CLI adapters. Do not patch auth/actor/governance to make local operation work.
- Strip inherited Desktop sandbox, task context and provider credential environment from the server process. Generate independent instance auth/signing secrets in ignored local state.
- Copy the prior role templates and custom ifixai-audit skill; remove obsolete VPS executable assumptions. Do not claim the Windows iFixAi engine/adapter is installed.
- Bootstrap through company-scoped APIs on the verified own localhost instance; no existing agent edits, no credential transfer, no approval-policy bypass, no agent/model call. New agents paused with conservative initial sandbox settings.
- Maintain origin fork + official upstream and branch dev/windows-local; source review before merges, backup before DB schema updates.

## Constraints and validation

Keep the user's pre-existing Windows login/junction patches and verify their targeted tests. Preserve local old DB roots and VPS. Never put runtime state, session keys or logs in Git. No source changes to DatVietMap, no requirement to move its checkout.

Targeted tests and actual local API/lifecycle/bootstrap checks are required. This is a local operational profile, not a claim that every upstream build/release/Rust lane supports Windows. Provider login and project/MCP qualification remain per machine. See `../WINDOWS-LOCAL.md`.

## Follow-up: pin the CLI used by the Windows server

The user authorised upgrading/selecting Paperclip's Codex CLI. The inherited PATH selected 0.157.1 while Desktop used a newer bundled executable; the same managed ChatGPT connection exposed GPT-6.1 Sol only on the newer client. Install stable 0.162.1 into ignored repo-local tooling, keep an exact version pin in Git and put its native binary/resources on the server-only PATH. Do not modify Desktop/global installs, model/account bindings, sandbox permissions or paused agents. Reject missing/mismatched packages before startup; company-PC installation remains explicit after pull.

Validation: 15 Node profile/CLI/junction tests passed; installer/version and restarted server health passed; model/list included GPT-6.1 Sol and the actual Paperclip codex_hello_probe_passed check passed for Minh Nguyen on 0.162.1. An offline instance backup preceded the restart. This does not upgrade the separate ACP dependency or qualify every connected account/project.
