import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensurePaperclipSkillSymlink } from "@paperclipai/adapter-utils/server-utils";

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-skill-link-"));
  roots.push(root);
  const source = path.join(root, "source");
  await fs.mkdir(source);
  await fs.writeFile(path.join(source, "SKILL.md"), "skill fixture");
  return { root, source, target: path.join(root, "linked") };
}
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const relative = path.relative(os.tmpdir(), root);
    if (!relative.startsWith("paperclip-skill-link-") || relative.includes(path.sep)) throw new Error("Invalid fixture cleanup path");
    await fs.rm(root, { recursive: true, force: true });
  }
});
describe("runtime skill directory links", () => {
  it("mounts skill resources without Windows symlink privileges and reuses the link", async () => {
    const { source, target } = await fixture();
    expect(await ensurePaperclipSkillSymlink(source, target)).toBe("created");
    expect(await fs.readFile(path.join(target, "SKILL.md"), "utf8")).toBe("skill fixture");
    expect(await ensurePaperclipSkillSymlink(source, target)).toBe("skipped");
    expect(await fs.readFile(path.join(source, "SKILL.md"), "utf8")).toBe("skill fixture");
  });
  it("repairs a dangling link but preserves an existing user directory", async () => {
    const { root, source, target } = await fixture();
    await fs.symlink(path.join(root, "missing"), target, process.platform === "win32" ? "junction" : "dir");
    expect(await ensurePaperclipSkillSymlink(source, target)).toBe("repaired");
    const own = path.join(root, "user-skill");
    await fs.mkdir(own);
    await fs.writeFile(path.join(own, "SKILL.md"), "user content");
    expect(await ensurePaperclipSkillSymlink(source, own)).toBe("skipped");
    expect(await fs.readFile(path.join(own, "SKILL.md"), "utf8")).toBe("user content");
  });
});
