import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

const installed = Symbol.for("paperclip.windows-background-children");
const policyUrl = import.meta.url;

/** All subprocesses of the dedicated Windows server are background jobs.
 * Install before importing the server, including third-party PostgreSQL/MCP
 * libraries. NODE_OPTIONS carries the same policy into local Node helpers;
 * native programs simply ignore that variable. No OS or terminal setting changes.
 */
export function installWindowsBackgroundChildren(target = childProcess, platform = process.platform) {
  if (platform !== "win32" || target[installed]) return false;
  const restorers = [];
  for (const name of ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync", "fork"]) {
    const original = target[name];
    if (typeof original !== "function") continue;
    target[name] = function (...args) {
      const index = ["exec", "execSync"].includes(name) ? 1
        : Array.isArray(args[1]) || (args[1] == null && args.length > 2) ? 2 : 1;
      const supplied = args[index];
      const options = supplied && typeof supplied === "object" ? supplied : {};
      // Preserve callback overloads, arguments, stdio, signals and timeouts.
      if (typeof supplied === "function") args.splice(index, 0, {});
      const env = { ...(options.env ?? process.env) };
      const preload = `--import=${policyUrl}`;
      if (!String(env.NODE_OPTIONS ?? "").includes(preload)) {
        env.NODE_OPTIONS = [env.NODE_OPTIONS, preload].filter(Boolean).join(" ");
      }
      env.PAPERCLIP_WINDOWS_BACKGROUND_CHILDREN = "1";
      args[index] = { ...options, windowsHide: true, env };
      return Reflect.apply(original, this, args);
    };
    if (original[promisify.custom] && ["exec", "execFile"].includes(name)) {
      const wrapped = target[name];
      Object.defineProperty(wrapped, promisify.custom, { value: (...args) => {
        let child;
        const promise = new Promise((resolve, reject) => {
          child = wrapped(...args, (error, stdout, stderr) => {
            if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); }
            else resolve({ stdout, stderr });
          });
        });
        promise.child = child;
        return promise;
      } });
    }
    restorers.push(() => { target[name] = original; });
  }
  target[installed] = true;
  if (target === childProcess) syncBuiltinESMExports();
  return function restore() {
    for (const restore of restorers) restore();
    delete target[installed];
    if (target === childProcess) syncBuiltinESMExports();
  };
}

if (process.env.PAPERCLIP_WINDOWS_BACKGROUND_CHILDREN === "1") {
  installWindowsBackgroundChildren();
}
