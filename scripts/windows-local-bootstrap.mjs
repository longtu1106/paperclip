import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { status, runtimeRoot, repoRoot, writeJson } from "./windows-local.mjs";

const base = "http://localhost:3100";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const args = process.argv.slice(2);
const withTeam = args.includes("--team");
let companyId;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--team") continue;
  if (args[i] === "--company-id" && uuid.test(args[i + 1] ?? "")) { companyId = args[++i]; continue; }
  throw new Error("Use [--team] [--company-id UUID].");
}

async function api(method, route, body) {
  const response = await fetch(base + "/api" + route, { method, signal: AbortSignal.timeout(30000), redirect: "error",
    headers: { Origin: base, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`${method} ${route} returned HTTP ${response.status}; inspect the dashboard. No automatic policy bypass.`);
  return await response.json();
}

async function main() {
  const state = await status();
  if (!state.running || state.health?.status !== "ok" || state.executionEnabled) throw new Error("Start this Windows profile in maintenance mode before bootstrap.");
  const companies = await api("GET", "/companies");
  const matches = companies.filter((company) => companyId ? company.id === companyId : company.name === "Longtu Local");
  if (matches.length > 1) throw new Error("Choose --company-id explicitly.");
  let company = matches[0];
  if (!company) {
    if (companyId || companies.length) throw new Error("Company selection is ambiguous; choose --company-id UUID.");
    company = await api("POST", "/companies", { name: "Longtu Local", description: "Paperclip native Windows. Three shared roles; each PC has separate projects and credentials." });
  }
  if (!uuid.test(company.id)) throw new Error("Invalid company identity.");
  const skills = await api("GET", `/companies/${company.id}/skills`);
  if (!Array.isArray(skills)) throw new Error("Unexpected skill library response.");
  const markdown = fs.readFileSync(path.join(repoRoot, "local-config/skills/ifixai-audit/SKILL.md"), "utf8");
  const hash = createHash("sha256").update(markdown).digest("hex");
  let skill = skills.find((entry) => entry.slug === "ifixai-audit");
  if (!skill) skill = await api("POST", `/companies/${company.id}/skills`, {
    name: "ifixai-audit", slug: "ifixai-audit", description: "Prepare and review requested iFixAi audits; Windows engine and adapter require separate setup.",
    markdown, categories: ["Engineering"], sharingScope: "company", idempotencyKey: "windows-ifixai-" + hash,
  });
  else {
    if (!uuid.test(skill.id)) throw new Error("Invalid skill identity.");
    const current = await api("GET", `/companies/${company.id}/skills/${skill.id}`);
    if (current.markdown?.replace(/\r\n/g, "\n").trim() !== markdown.replace(/\r\n/g, "\n").trim()) throw new Error("Skill already differs on the dashboard. Compare it with local-config before replacing it.");
  }
  if (!uuid.test(skill.id)) throw new Error("Unexpected skill create response; inspect the library before retrying.");
  const receipt = { companyId: company.id, companyName: company.name, skillId: skill.id, skillKey: skill.key, sourceHash: hash, agents: [] };
  writeJson(path.join(runtimeRoot, "bootstrap.json"), receipt);

  if (withTeam) {
    const existing = await api("GET", `/companies/${company.id}/agents`);
    const roles = [
      ["Culi 1 (Codex Mn)", "Điều phối / Kiến trúc", "coordinator.md"],
      ["Culi 2 (Codex L)", "Lập trình", "developer.md"],
      ["Culi 3 (Codex DVM)", "Review / Kiểm thử", "reviewer-qa.md"],
    ];
    for (const [name, title, file] of roles) {
      let agent = existing.find((entry) => entry.name === name);
      if (!agent) {
        const common = fs.readFileSync(path.join(repoRoot, "local-config/agent-roles/common.md"), "utf8");
        const instructions = fs.readFileSync(path.join(repoRoot, "local-config/agent-roles", file), "utf8");
        agent = await api("POST", `/companies/${company.id}/agents`, {
          name, title, role: "general", adapterType: "codex_local",
          adapterConfig: { engine: "cli", model: "gpt-6.1-sol", dangerouslyBypassApprovalsAndSandbox: false, extraArgs: ["--sandbox", "read-only", "--skip-git-repo-check"] },
          runtimeConfig: { heartbeat: { enabled: false } },
          desiredSkills: [skill.key], instructionsBundle: { entryFile: "AGENTS.md", files: { "AGENTS.md": common + "\n\n" + instructions } },
        });
        if (!uuid.test(agent.id)) throw new Error("Invalid agent identity.");
        await api("POST", `/agents/${agent.id}/pause`, {});
      }
      receipt.agents.push({ id: agent.id, name: agent.name });
      writeJson(path.join(runtimeRoot, "bootstrap.json"), receipt);
    }
  }
  console.log(JSON.stringify({ ...receipt, url: base, executionEnabled: false, note: "No provider login, task, live audit or agent run was performed." }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
