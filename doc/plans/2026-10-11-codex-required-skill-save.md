# Codex operational skill selection (2026-10-11)

The Codex legacy adapter always mounts `paperclipai/paperclip/paperclip`,
including after an explicit empty selection. Its Skills page previously offered
an off switch and retried saving the empty draft after every normalized response.

Show this skill as required by the Codex runtime with a disabled toggle and a
reason. Accept a normalized save response when it belongs to the current draft;
preserve any newer user edit made during the pending request. Optional skills
and the native Paperclip Runner retain their existing selection rules.

Verification: state tests cover normalization without another save, an edit
during a pending save, and the adapter-specific required skill boundary. Run
the token gate for the UI change. No API, database or runtime authority change.

This patch needs a new server image to appear on the public dashboard. The
home-PC mobile runtime and its scoped task MCP remain a separate pilot.
