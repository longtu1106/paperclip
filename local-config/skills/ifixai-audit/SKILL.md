---
name: ifixai-audit
description: Prepare and review iFixAi behavioral audits for Paperclip agents when the user requests an audit of role boundaries, tool permissions, prompt injection, governance or evidence quality. Complements code review; does not run on every coding task.
---

# iFixAi audit for Paperclip

Use only for a requested agent audit. Preserve the assigned role and the user's plan/phase approval flow. This skill adds instructions, not tools, access or runtime enforcement.

## Runtime readiness

iFixAi 4.1.0 was previously installed on the retired VPS. This Windows distribution copies the skill instructions only; it does not install that Python engine or copy any VPS adapter session. The optional local engine location is `<paperclip-repo>/data/ifixai-audit/venv/Scripts/ifixai.exe`. Verify the current execution environment, executable, target adapter and fixture before running. If unavailable during a requested audit, prepare the audit specification and report the exact missing component to the operator. Do not install dependencies, change sandbox permissions or create recovery loops automatically.

The local Paperclip dashboard is not an OpenAI-compatible chat endpoint. A real audit of these Paperclip agents requires a target-specific ChatProvider adapter and evidence hooks. Testing a standalone model with similar instructions is a proxy test and must be labeled as such. Never claim that it tests the actual Paperclip agent or its runtime permissions.

## Responsibilities

- Culi 1 (coordinator): define the target agent, workspace/environment, intended role, inputs/outputs, allowed/forbidden operations, approval boundaries and acceptance criteria. Prepare the audit plan and fixture; obtain the user's decision on uncertain flow changes.
- Culi 2 (developer): implement adapter/fixture changes only within an approved development task. Isolate the system under test and use synthetic or explicitly approved local/dev data. Record changes and reproducible commands. Do not grade your own implementation as independent verification.
- Culi 3 (review/QA): independently review the adapter, fixture and evidence; execute only supported, authorized probes. Report PASS/FAIL/BLOCKED/NOT_RUN and distinguish declared policy, observed behavior and missing evidence. Recheck regressions after fixes.

## Workflow

1. Identify whether this is installation smoke, a proxy model evaluation, or a real agent audit. Record the exact target version, role, environment, tools and fixture revision.
2. Consult the official fixture and adapter documentation. Encode only agreed policies. Include role boundaries, user approval of plan changes, cross-project scope, truthful test reporting, prompt injection and refusal to fabricate Done. Do not turn YAML declarations into claims of runtime enforcement.
3. Check readiness without revealing secrets. Use no production mutations. Any database seeding must stay within the user's explicitly approved local/dev scope and have an identifiable cleanup manifest. Dry-run estimates alone do not authorize paid calls.
4. For a live evaluation, agree on the target, credentials supplied through secret storage, allowed probes, independent judge and API budget. Subscription sign-in alone is not an iFixAi SDK API key. Do not copy token/config files or automatically enable paid providers.
5. Run a bounded suite, preserve report JSON/Markdown and run manifest, and attach traceable findings. Missing tool/auth/audit/retrieval hooks mean insufficient evidence, not PASS. Self-judged results are smoke/proxy evidence, not independent assurance.
6. Review failures before creating fix tasks. Keep original reports and compare the same suite/fixture after changes. Do not run the audit automatically on every task.

## Windows operator readiness

Run the engine's help only after an operator installs and verifies it in a separate local venv:

```powershell
& '.\data\ifixai-audit\venv\Scripts\ifixai.exe' --help
```

No live audit or mock suite is bundled by this skill. An installation smoke must use a separately inspected mock fixture, telemetry disabled and no paid calls. A sample fixture's FAIL findings describe sample behavior, not these three agents. A generated report proves engine operation only.

## Sources

- https://github.com/ifixai-ai/iFixAi
- https://github.com/ifixai-ai/iFixAi/blob/main/docs/testing-your-agent.md
- https://github.com/ifixai-ai/iFixAi/blob/main/docs/fixture_authoring.md
- Upstream skill staged separately from commit 89f4d5ceeb9fe2bc3963e6a16402cace9f8c1b90; its Claude plugin hooks/CLAUDE_PLUGIN_DATA paths are not Paperclip runtime paths.
