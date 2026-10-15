import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { open } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  runSetupTokenLogin, parseSetupTokenPrompt, parseSetupTokenCredential,
  SETUP_TOKEN_BEFORE_ANCHOR, SETUP_TOKEN_AFTER_ANCHOR,
} from "@paperclipai/adapter-claude-local/server";
import { runDeviceLogin } from "@paperclipai/adapter-codex-local/server";

export type LocalBrowserLoginState = {
  authorizationUrl?: string;
  code?: string;
  outcome?: "success" | "failure";
  submitCode?: (code: string) => void;
  /** Windows Claude credentials remain in memory until scoped vault promotion. */
  readCredential?: () => string | null;
  abort: () => void;
};

// Node has no built-in PTY API. Python's standard-library pty module supplies
// the terminal required by both CLIs. The Docker image already includes
// python3. This bridge forwards only bytes; provider output is never logged.
const PYTHON_PTY_BRIDGE = String.raw`
import errno, os, pty, select, signal, sys
pid, master = pty.fork()
if pid == 0:
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)
def stop(_signal, _frame):
    try: os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError: pass
    sys.exit(1)
signal.signal(signal.SIGTERM, stop)
while True:
    readable, _, _ = select.select([master, 0], [], [])
    if 0 in readable:
        data = os.read(0, 4096)
        if data: os.write(master, data)
        else: stop(None, None)
    if master in readable:
        try: data = os.read(master, 4096)
        except OSError as error:
            if error.errno == errno.EIO: break
            raise
        if not data: break
        os.write(1, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`;

/** Run the same browser-code login used by sandbox connections on the local host. */
export function startLocalBrowserLogin(provider: "anthropic" | "openai", home: string): LocalBrowserLoginState {
  const controller = new AbortController();
  const state: LocalBrowserLoginState = { abort: () => controller.abort() };
  const executable = provider === "anthropic" ? "claude" : "codex";
  const args = provider === "anthropic" ? ["setup-token"] : ["login", "--device-auth"];
  // Codex device login works with pipes on Windows and writes its prompt to
  // stderr. Python's Unix PTY bridge cannot run there (termios is unavailable).
  const directCodexLogin = process.platform === "win32" && provider === "openai";
  const windowsClaudeLogin = process.platform === "win32" && provider === "anthropic";
  let child: ChildProcessWithoutNullStreams | null = null;
  let terminal: import("node-pty").IPty | null = null;
  let credential: Buffer | null = null;
  let terminalOutput = "";
  const clearCredential = () => { credential?.fill(0); credential = null; terminalOutput = ""; };
  controller.signal.addEventListener("abort", clearCredential, { once: true });
  if (windowsClaudeLogin) {
    state.readCredential = () => state.outcome === "success" && credential ? credential.toString("utf8") : null;
  }
  const stopChild = () => {
    if (terminal) { const active = terminal; terminal = null; active.kill(); }
    else child?.kill("SIGTERM");
  };
  const driver = {
    async start(_command: string, onData: (chunk: string) => void): Promise<{ exitCode: number | null }> {
      const env = { ...process.env,
        ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", CLAUDE_CODE_OAUTH_TOKEN: "",
        OPENAI_API_KEY: "", CODEX_API_KEY: "",
        CLAUDE_CONFIG_DIR: provider === "anthropic" ? home : process.env.CLAUDE_CONFIG_DIR,
        CODEX_HOME: provider === "openai" ? home : process.env.CODEX_HOME,
        BROWSER: "true",
      };
      if (windowsClaudeLogin) {
        // ConPTY supplies the interactive terminal required by setup-token.
        // Import only on Windows Claude sign-in; other adapters need no native module.
        const pty = await import("node-pty");
        if (controller.signal.aborted) throw new Error("Local sign-in cancelled");
        const nativeClaude = path.join(homedir(), ".local", "bin", "claude.exe");
        terminal = pty.spawn(existsSync(nativeClaude) ? nativeClaude : "claude.exe", args, {
          name: "xterm-256color", cols: 160, rows: 40, cwd: home, env,
        });
        let promptSent = false;
        let tokenSent = false;
        terminal.onData((data) => {
          if (controller.signal.aborted || tokenSent) return;
          terminalOutput += data;
          // ConPTY puts the hyperlink immediately after the preamble and uses
          // absolute cursor moves for new rows. Normalize complete records only,
          // so split control sequences and hyperlinks survive chunk boundaries.
          const normalized = terminalOutput
            .replace(/\x1b\]8;[^;\x1b\x07]*;([^\x1b\x07]+)(?:\x1b\\|\x07)[\s\S]*?\x1b\]8;[^;\x1b\x07]*;(?:\x1b\\|\x07)/g, "\n$1\n")
            .replace(/\x1b\[[0-9;]*H/g, "\n");
          if (!promptSent) {
            const prompt = parseSetupTokenPrompt(normalized);
            if (prompt) {
              promptSent = true;
              terminalOutput = "";
              onData(`Browser didn't open? Use the url below to sign in (c to copy)\n${prompt.url}\n${prompt.prompt} >\n`);
            }
          } else {
            const token = parseSetupTokenCredential(normalized);
            if (token) {
              tokenSent = true;
              terminalOutput = "";
              onData(`${SETUP_TOKEN_BEFORE_ANCHOR}\n${token}\n${SETUP_TOKEN_AFTER_ANCHOR}\n`);
            }
          }
          terminalOutput = terminalOutput.slice(-64 * 1024);
        });
        return new Promise((resolve) => {
          terminal!.onExit(({ exitCode }) => resolve({ exitCode }));
        });
      }
      return new Promise((resolve, reject) => {
        child = spawn(directCodexLogin ? "codex.exe" : "python3",
          directCodexLogin ? args : ["-u", "-c", PYTHON_PTY_BRIDGE, executable, ...args],
          { env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        child.stdout.on("data", (bytes: Buffer) => onData(bytes.toString("utf8")));
        // Feed Windows Codex's stderr only to the bounded in-memory parser;
        // provider output must never be logged or retained as diagnostics.
        if (directCodexLogin) child.stderr.on("data", (bytes: Buffer) => onData(bytes.toString("utf8")));
        else child.stderr.resume();
        child.once("error", reject);
        child.once("close", (exitCode) => resolve({ exitCode }));
      });
    },
    write(input: string) { if (terminal) terminal.write(input); else child?.stdin.write(input); },
    stop: stopChild,
    async dispose() { terminalOutput = ""; stopChild(); },
    async readFile(file: string) { const { readLocalAiCredentialFile } = await import("./local-ai-credential-file.js"); return Buffer.from(await readLocalAiCredentialFile(file)); },
  };
  if (provider === "anthropic") {
    let deliverCode: ((code: string) => void) | undefined;
    const codeReady = new Promise<string>((resolve) => { deliverCode = resolve; });
    state.submitCode = (code) => { deliverCode?.(code); deliverCode = undefined; };
    void runSetupTokenLogin(driver, {
      timeoutMs: 300_000, signal: controller.signal,
      onPrompt: (prompt) => { state.authorizationUrl = prompt.url; },
      provideCode: (signal) => new Promise<string>((resolve, reject) => {
        const abort = () => reject(new Error("Local sign-in cancelled"));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        codeReady.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      }),
      onCredential: async (bytes) => {
        if (windowsClaudeLogin) {
          if (controller.signal.aborted) throw new Error("Local sign-in cancelled");
          clearCredential();
          credential = Buffer.from(bytes);
          return;
        }
        const file = await open(path.join(home, ".credentials.json"),
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        try {
          await file.writeFile(JSON.stringify({ claudeAiOauth: { accessToken: bytes.toString("utf8") } }));
        } finally {
          await file.close();
        }
      },
    }).then((result) => {
      state.outcome = result.outcome === "success" && !controller.signal.aborted ? "success" : "failure";
      if (state.outcome === "failure") clearCredential();
    }).catch(() => { clearCredential(); state.outcome = "failure"; });
  } else {
    void runDeviceLogin(driver, {
      timeoutMs: 300_000, signal: controller.signal,
      onPrompt: (prompt) => { state.authorizationUrl = prompt.url; state.code = prompt.code; },
    }).then((result) => { state.outcome = result.outcome === "success" ? "success" : "failure"; })
      .catch(() => { state.outcome = "failure"; });
  }
  return state;
}
