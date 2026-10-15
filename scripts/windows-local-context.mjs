import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { repoRoot, runtimeRoot, status, writeJson, childEnvironment } from "./windows-local.mjs";
import { codexSelection, validateCodex } from "./windows-local-codex.mjs";

const base = "http://localhost:3100";
const companyName = "Longtu Local";
const begin = "<!-- windows-personal-context:start -->";
const end = "<!-- windows-personal-context:end -->";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ignored = /^(?:\.git|node_modules|__pycache__|\.DS_Store|\.env(?:\..*)?|auth\.json|credentials\.json|\.npmrc|id_rsa|id_ed25519)$/i;

export function personalSkills(userProfile) {
  const selected = new Map();
  for (const folder of [".codex", ".agents", ".claude"]) {
    const root = path.join(userProfile, folder, "skills");
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".") || !entry.isDirectory()) continue;
      const source = path.join(root, entry.name);
      if (!fs.existsSync(path.join(source, "SKILL.md")) || selected.has(entry.name)) continue;
      const files = [];
      function visit(dir, prefix = "") {
        for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
          if (ignored.test(child.name)) continue;
          if (child.isSymbolicLink()) throw new Error(`Review linked skill resource before copying: ${entry.name}/${prefix}${child.name}`);
          const relative = prefix + child.name;
          const absolute = path.join(dir, child.name);
          if (child.isDirectory()) visit(absolute, relative + "/");
          else if (child.isFile()) {
            const bytes = fs.readFileSync(absolute);
            if (/sk-(?:ant-)?[A-Za-z0-9_-]{40,}|-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/.test(bytes.toString("utf8"))) {
              throw new Error(`Credential-like content requires review: ${entry.name}/${relative}`);
            }
            files.push({ path: relative, bytes, hash: hash(bytes) });
          }
        }
      }
      visit(source);
      files.sort((a, b) => a.path.localeCompare(b.path));
      selected.set(entry.name, { name: entry.name, source, files, hash: hash(files.map((f) => `${f.path}:${f.hash}`).join("\n")) });
    }
  }
  return [...selected.values()];
}

export function accessArgs(args = []) {
  const kept = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (["--sandbox", "-s", "--add-dir"].includes(arg)) { i++; continue; }
    if (/^(--sandbox=|--add-dir=|--full-auto$|--yolo$|--dangerously-bypass-approvals-and-sandbox$)/.test(arg)) continue;
    if (["-c", "--config"].includes(arg) && /^(sandbox_mode|sandbox_workspace_write\.network_access)\s*=/.test(args[i + 1] ?? "")) { i++; continue; }
    if (arg === "--profile" || arg === "-p" || arg.startsWith("--profile=")) throw new Error("Review explicit Codex profile before changing drive access.");
    kept.push(arg);
  }
  if (!kept.includes("--skip-git-repo-check")) kept.push("--skip-git-repo-check");
  // With bypass=false and no explicit sandbox/profile, the adapter supplies
  // workspace-write + its governed network setting. Managed connections reject
  // user-provided -c overrides; do not work around that authentication guard.
  return [...kept, "--add-dir", "C:/", "--add-dir", "E:/"];
}

export function mergeContext(original, common) {
  const start = original.indexOf(begin), stop = original.indexOf(end);
  if ((start < 0) !== (stop < 0) || (start >= 0 && stop < start)) throw new Error("Malformed existing context marker; review instructions manually.");
  const block = `${begin}\n${common.trim()}\n${end}`;
  return start >= 0 ? original.slice(0, start) + block + original.slice(stop + end.length) : original.trimEnd() + "\n\n" + block + "\n";
}

export function roleSkillNames(name, skills) {
  const common = new Set(["human-ui", "vng-single-task", "vng-large-task-orchestrator", "gortex-fallback", "pdf", "playwright"]);
  const role = name.startsWith("Culi 1") ? /^(cshub-multi-agent-prompts|gortex-(architecture-review|onboarding|explore|impact|guide|cross-repo-usage|dataflow-trace|co-change|incident-investigation))$/
    : name.startsWith("Culi 2") ? /^(business-segment-edit-prompts|zbs-flow-checker|gortex-(debug|explore|impact|safe-edit|refactor|rename|extract-function|fix-all|cli|guide|dataflow-trace|cross-repo-usage|add-test))$/
    : /^(business-segment-edit-prompts|zbs-flow-checker|gortex-(pr-review|pr-review-agent|quality-audit|add-test|architecture-review|co-change|dataflow-trace|impact|incident-investigation|guide|cross-repo-usage|debug))$/;
  return skills.filter((s) => common.has(s.name) || s.name.startsWith("ui-preset-") || role.test(s.name)).map((s) => s.name);
}

async function api(method, route, body, missing = false) {
  const r = await fetch(base + "/api" + route, { method, headers: { Origin: base, "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000), redirect: "error" });
  if (missing && r.status === 404) return null;
  if (!r.ok) throw new Error(`${method} ${route}: HTTP ${r.status}. Inspect the dashboard; no policy bypass was attempted.`);
  return r.json();
}

export async function applyContext(apply = false) {
  const skills = personalSkills(process.env.USERPROFILE ?? "");
  const plan = { personalSkillCount: skills.length, files: skills.reduce((n, s) => n + s.files.length, 0),
    skills: skills.map((s) => s.name), docsRoot: "E:/ProjectVNG/docsVNG", writableRoots: ["C:/", "E:/"], windowsSandbox: "unelevated", cliApprovalPolicy: "never", apply };
  if (!apply) return plan;
  if (process.platform !== "win32" || !process.env.USERPROFILE) throw new Error("Use the normal Windows user on this PC.");
  const state = await status();
  if (!state.running || state.health?.status !== "ok") throw new Error("Start the Windows profile first.");
  if (!fs.existsSync(plan.docsRoot)) throw new Error("Shared docs root is unavailable; configure it on this PC first.");
  const sandboxHome = path.join(runtimeRoot, "sandbox-check");
  fs.mkdirSync(sandboxHome, { recursive: true });
  const codex = validateCodex(codexSelection());
  // Google Drive's per-user filesystem is not readable through MXC on this
  // machine. Use the supported same-user restricted-token sandbox, and prove
  // that the shared-docs junction can be read before touching agent settings.
  const windowsProbe = spawnSync(codex.executable, ["-c", 'windows.sandbox="unelevated"', "sandbox", "--include-managed-config", "--permission-profile", ":workspace", "--",
    path.join(process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe"), "-NoProfile", "-Command",
    "try { $text = [System.IO.File]::ReadAllText('E:/ProjectVNG/docsVNG/cshub-instructions/feature-workflow.md'); if ($text.Length -gt 0) { 'DOCS_READ_OK' } else { exit 1 } } catch { exit 1 }"], {
    cwd: repoRoot, env: { ...childEnvironment(), CODEX_HOME: sandboxHome }, encoding: "utf8", windowsHide: true, timeout: 20000,
  });
  if (windowsProbe.status !== 0 || !windowsProbe.stdout?.includes("DOCS_READ_OK")) throw new Error("Shared docs cannot be read in the Windows restricted-token sandbox. Review this PC's filesystem/sandbox setup before applying context; no bypass was enabled.");
  const company = (await api("GET", "/companies")).filter((c) => c.name === companyName);
  if (company.length !== 1) throw new Error("Select exactly one Longtu Local company before applying.");
  const companyId = company[0].id;
  const agents = (await api("GET", `/companies/${companyId}/agents`)).filter((a) => /^Culi [123] \(/.test(a.name));
  if (agents.length !== 3 || agents.some((a) => !["idle", "paused"].includes(a.status) || a.adapterType !== "codex_local")) throw new Error("Expected three idle/paused Codex agents; no active agent was interrupted.");
  if ((await api("GET", `/companies/${companyId}/issues`)).some((i) => i.status === "in_progress")) throw new Error("Finish active work before changing runtime context.");
  const backup = path.join(runtimeRoot, "context-backups", new Date().toISOString().replace(/[:.]/g, "-"));
  const before = [];
  for (const agent of agents) {
    before.push({ agent, skills: await api("GET", `/agents/${agent.id}/skills`), instructions: await api("GET", `/agents/${agent.id}/instructions-bundle/file?path=AGENTS.md`) });
  }
  writeJson(path.join(backup, "agents.json"), before);
  const installed = await api("GET", `/companies/${companyId}/skills`);
  const imported = [];
  for (const skill of skills) {
    let current = installed.find((s) => s.key === `company/${companyId}/${skill.name}`);
    const main = skill.files.find((f) => f.path === "SKILL.md");
    if (!current) current = await api("POST", `/companies/${companyId}/skills`, {
      name: skill.name, slug: skill.name, markdown: main.bytes.toString("utf8"), sharingScope: "company", categories: ["Engineering"],
      idempotencyKey: `windows-personal-${skill.name}-${skill.hash}`,
    });
    for (const file of skill.files) {
      const stored = await api("GET", `/companies/${companyId}/skills/${current.id}/files?path=${encodeURIComponent(file.path)}`, undefined, true);
      if (stored) {
        const bytes = Buffer.from(stored.content, stored.encoding === "base64" ? "base64" : "utf8");
        if (hash(bytes) !== file.hash) throw new Error(`Dashboard skill differs: ${skill.name}/${file.path}. Compare before replacing it.`);
      } else {
        const utf8 = file.bytes.toString("utf8");
        const binary = !Buffer.from(utf8).equals(file.bytes);
        await api("PATCH", `/companies/${companyId}/skills/${current.id}/files`, {
          path: file.path, content: binary ? file.bytes.toString("base64") : utf8, encoding: binary ? "base64" : "utf8",
          idempotencyKey: `windows-personal-${hash(file.path)}-${file.hash}`,
        });
      }
    }
    imported.push({ name: skill.name, key: current.key, id: current.id, hash: skill.hash, source: skill.source, fileCount: skill.files.length });
    writeJson(path.join(backup, "import-progress.json"), imported);
  }
  const common = fs.readFileSync(path.join(repoRoot, "local-config/agent-roles/common.md"), "utf8");
  const configured = [];
  for (const old of before) {
    const { agent } = old;
    const content = mergeContext(old.instructions.content, common);
    if (content !== old.instructions.content) await api("PUT", `/agents/${agent.id}/instructions-bundle/file`, { path: "AGENTS.md", content, baseHash: old.instructions.contentHash });
    const config = { ...agent.adapterConfig, cliApprovalPolicy: "never", windowsSandbox: "unelevated", dangerouslyBypassApprovalsAndSandbox: false, dangerouslyBypassSandbox: false,
      extraArgs: accessArgs(agent.adapterConfig.extraArgs ?? agent.adapterConfig.args), env: { ...agent.adapterConfig.env, VNG_DOCS_ROOT: plan.docsRoot } };
    await api("PATCH", `/agents/${agent.id}`, { adapterConfig: config });
    const names = roleSkillNames(agent.name, imported);
    await api("POST", `/agents/${agent.id}/skills/sync`, { mode: "add", desiredSkills: imported.filter((s) => names.includes(s.name)).map((s) => s.key) });
    configured.push({ id: agent.id, name: agent.name, assignedPersonalSkills: names, status: agent.status });
  }
  const receipt = { ...plan, checkedAt: new Date().toISOString(), companyId, backup, imported, agents: configured,
    note: "Original skills retained. No provider task, MCP login, disk ACL change, or credential transfer performed. Runtime skill discovery must be verified separately." };
  writeJson(path.join(runtimeRoot, "personal-context.json"), receipt);
  return { personalSkillCount: imported.length, fileCount: plan.files, backup, agents: configured.map((a) => ({ name: a.name, assignedPersonalSkills: a.assignedPersonalSkills.length })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) throw new Error("Use node scripts/windows-local-context.mjs [--apply].");
  applyContext(args[0] === "--apply").then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
