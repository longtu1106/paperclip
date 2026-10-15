import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function codexSelection(root = repoRoot, arch = process.arch) {
  const { codexVersion: version } = JSON.parse(fs.readFileSync(path.join(root, "local-config", "windows-tools.json"), "utf8"));
  if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) throw new Error("Pin an exact stable codexVersion in local-config/windows-tools.json.");
  const triple = { x64: "x86_64-pc-windows-msvc", arm64: "aarch64-pc-windows-msvc" }[arch];
  if (!triple) throw new Error(`Unsupported Windows Codex architecture: ${arch}`);
  const prefix = path.join(root, "data", "windows-tools", `codex-${version}`);
  const packageRoot = path.join(prefix, "node_modules", "@openai", "codex");
  const nativeRoot = path.join(prefix, "node_modules", "@openai", `codex-win32-${arch}`, "vendor", triple);
  return { version, triple, prefix, packageRoot, nativeRoot,
    executable: path.join(nativeRoot, "bin", "codex.exe"),
    pathDirs: [path.join(nativeRoot, "bin"), path.join(nativeRoot, "codex-path")] };
}

export function validateCodex(selection) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(selection.packageRoot, "package.json"), "utf8"));
    const manifest = JSON.parse(fs.readFileSync(path.join(selection.nativeRoot, "codex-package.json"), "utf8"));
    if (pkg.name !== "@openai/codex" || pkg.version !== selection.version ||
        manifest.layoutVersion !== 1 || manifest.version !== selection.version || manifest.target !== selection.triple ||
        manifest.entrypoint !== "bin/codex.exe" || manifest.resourcesDir !== "codex-resources" || manifest.pathDir !== "codex-path" ||
        !fs.statSync(selection.executable).isFile() || !fs.statSync(path.join(selection.nativeRoot, "codex-resources")).isDirectory() ||
        !fs.statSync(selection.pathDirs[1]).isDirectory()) throw new Error("Installed Codex package does not match its pin/layout.");
    return selection;
  } catch (error) {
    throw new Error(`Managed Codex ${selection.version} is missing or invalid. Run node scripts/windows-local-codex.mjs install. ${error.message}`);
  }
}

export function installCodex() {
  if (process.platform !== "win32") throw new Error("This installer is for native Windows only.");
  const selection = codexSelection();
  let installed = false;
  try { validateCodex(selection); installed = true; } catch { /* Install the exact selected package, never a global update. */ }
  if (!installed) {
    const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    if (!fs.existsSync(npmCli)) throw new Error("Use a Node installation that includes npm, then retry.");
    const result = spawnSync(process.execPath, [npmCli, "install", "--prefix", selection.prefix,
      "--no-save", "--no-package-lock", "--ignore-scripts", "--no-audit", "--no-fund",
      "--registry=https://registry.npmjs.org", `@openai/codex@${selection.version}`],
    { cwd: repoRoot, stdio: "inherit", timeout: 300000, windowsHide: true, shell: false });
    if (result.error || result.status !== 0) throw new Error("Codex installation failed; the running Paperclip process was not changed.");
  }
  validateCodex(selection);
  const version = spawnSync(selection.executable, ["--version"], { encoding: "utf8", timeout: 15000, windowsHide: true });
  if (version.status !== 0 || version.stdout.trim() !== `codex-cli ${selection.version}`) throw new Error("Installed Codex did not pass its version check.");
  return { installed: true, reused: installed, version: selection.version, executable: selection.executable, restartRequired: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).join(" ") !== "install") throw new Error("Use node scripts/windows-local-codex.mjs install.");
    console.log(JSON.stringify(installCodex(), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
