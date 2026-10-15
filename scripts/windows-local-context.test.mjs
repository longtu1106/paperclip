import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { accessArgs, mergeContext, personalSkills, roleSkillNames } from "./windows-local-context.mjs";

test("drive permissions replace stale sandbox/bypass flags and preserve unrelated options", () => {
  const args = accessArgs(["--sandbox", "read-only", "--dangerously-bypass-approvals-and-sandbox", "--add-dir", "D:/old", "--skip-git-repo-check", "--color", "never"]);
  assert.equal(args.includes("read-only"), false);
  assert.equal(args.includes("--dangerously-bypass-approvals-and-sandbox"), false);
  assert.equal(args.includes("D:/old"), false);
  assert.deepEqual(args.slice(0, 3), ["--skip-git-repo-check", "--color", "never"]);
  assert.ok(args.includes("C:/") && args.includes("E:/"));
  assert.deepEqual(accessArgs(args), args);
  assert.throws(() => accessArgs(["--profile", "custom"]), /Review explicit/);
});
test("context updates retain role instructions and are idempotent", () => {
  const first = mergeContext("Role and user edits\n", "Shared rules");
  assert.equal(mergeContext(first, "Shared rules"), first);
  const changed = mergeContext(first, "Updated shared rules");
  assert.ok(changed.startsWith("Role and user edits\n"));
  assert.equal(changed.includes("\nShared rules\n"), false);
  assert.throws(() => mergeContext("<!-- windows-personal-context:start -->", "rules"), /Malformed/);
});
test("skill discovery prefers Codex variants, retains supporting resources and rejects private keys", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-personal-test-"));
  t.after(() => {
    const relative = path.relative(os.tmpdir(), root);
    assert.ok(relative.startsWith("paperclip-personal-test-") && !relative.includes(path.sep));
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const folder of [".codex", ".claude"]) {
    const dir = path.join(root, folder, "skills", "human-ui");
    fs.mkdirSync(path.join(dir, "references"), { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `name: ${folder}`);
    fs.writeFileSync(path.join(dir, "references", "layout.md"), "reference");
    fs.writeFileSync(path.join(dir, ".env"), "must not copy");
  }
  const [skill] = personalSkills(root);
  assert.equal(personalSkills(root).length, 1);
  assert.ok(skill.source.includes(".codex"));
  assert.deepEqual(skill.files.map((f) => f.path), ["references/layout.md", "SKILL.md"]);
  fs.writeFileSync(path.join(skill.source, "private.pem"), "-----BEGIN PRIVATE KEY-----");
  assert.throws(() => personalSkills(root), /Credential-like/);
});
test("specialist assignments share UI/workflow skills and keep implementation tools on the developer", () => {
  const skills = ["human-ui", "vng-single-task", "ui-preset-guided-admin", "gortex-rename", "gortex-pr-review", "cshub-multi-agent-prompts"].map((name) => ({ name }));
  assert.ok(roleSkillNames("Culi 2 (Codex L)", skills).includes("gortex-rename"));
  assert.equal(roleSkillNames("Culi 1 (Codex Mn)", skills).includes("gortex-rename"), false);
  assert.ok(roleSkillNames("Culi 1 (Codex Mn)", skills).includes("cshub-multi-agent-prompts"));
  assert.ok(roleSkillNames("Culi 3 (Codex DVM)", skills).includes("gortex-pr-review"));
  for (const n of [1, 2, 3]) assert.ok(roleSkillNames(`Culi ${n}`, skills).includes("human-ui"));
});
