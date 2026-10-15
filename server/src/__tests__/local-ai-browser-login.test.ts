import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startLocalBrowserLogin } from "../services/local-ai-browser-login.js";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), ptySpawn: vi.fn() }));
vi.mock("node-pty", () => ({ spawn: mocks.ptySpawn }));
vi.mock("node:child_process", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:child_process")>(), spawn: mocks.spawn,
}));

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform")!;
const promptUrl = "https://auth.openai.com/codex/device";
const promptCode = "ABCD-EFGHJ";
const prompt = `${promptUrl}\nEnter your one-time code:\n${promptCode}\n`;
let child: EventEmitter & {
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(process, "platform", { value: "win32" });
  child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  mocks.spawn.mockReturnValue(child);
});

describe("local Windows Claude browser login", () => {
  const url = "https://claude.com/cai/oauth/authorize?client_id=cid&code=abcdefgh&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&response_type=code&scope=user&state=0123456789abcdef";
  const token = "sk-ant-oat01-AAAABBBBCCCCDDDDEEEE11112222FFFFGGGG_HHHH-IIII";
  const loginPrompt = `Opening browser to sign in…\nBrowser didn't open? Use the url below to sign in (c to copy)\n${url}\nPaste code here if prompted >\n`;
  const success = `✓ Long-lived authentication token created successfully!\n\nYour OAuth token (valid for 1 year):\n\n${token}\n\nStore this token securely. You won't be able to see it again.\n`;

  function fakeTerminal() {
    let data: (chunk: string) => void = () => {};
    let exit: (event: { exitCode: number }) => void = () => {};
    const terminal = {
      onData: vi.fn((callback) => { data = callback; }),
      onExit: vi.fn((callback) => { exit = callback; }),
      write: vi.fn(), kill: vi.fn(),
    };
    mocks.ptySpawn.mockReturnValue(terminal);
    return { terminal, data: (chunk: string) => data(chunk), exit: (exitCode: number) => exit({ exitCode }) };
  }

  it("uses ConPTY, submits the browser code, and retains credentials only until cancellation", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "ambient-fixture-key");
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "ambient-fixture-token");
    const fake = fakeTerminal();
    const state = startLocalBrowserLogin("anthropic", "isolated-fixture-home");
    await vi.waitFor(() => expect(mocks.ptySpawn).toHaveBeenCalled());
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.ptySpawn).toHaveBeenCalledWith(expect.stringMatching(/claude\.exe$/), ["setup-token"], expect.objectContaining({
      cwd: "isolated-fixture-home", env: expect.objectContaining({ CLAUDE_CONFIG_DIR: "isolated-fixture-home", ANTHROPIC_API_KEY: "", CLAUDE_CODE_OAUTH_TOKEN: "" }),
    }));
    fake.data(loginPrompt);
    expect(state.authorizationUrl).toBe(url);
    expect(state.readCredential?.()).toBeNull();
    state.submitCode!("fixture-code");
    await vi.waitFor(() => expect(fake.terminal.write).toHaveBeenCalledWith("\r"));
    expect(fake.terminal.write).toHaveBeenCalledWith("fixture-code");
    fake.data(success);
    expect(state.readCredential?.()).toBeNull();
    fake.exit(0);
    await vi.waitFor(() => expect(state.outcome).toBe("success"));
    expect(state.readCredential?.()).toBe(token);
    expect(JSON.stringify(state)).not.toContain(token);
    state.abort();
    expect(state.readCredential?.()).toBeNull();
  });

  it("discards a parsed token after a nonzero exit", async () => {
    const fake = fakeTerminal();
    const state = startLocalBrowserLogin("anthropic", "isolated-fixture-home");
    await vi.waitFor(() => expect(mocks.ptySpawn).toHaveBeenCalled());
    fake.data(loginPrompt);
    fake.data(success);
    fake.exit(1);
    await vi.waitFor(() => expect(state.outcome).toBe("failure"));
    expect(state.readCredential?.()).toBeNull();
    expect(fake.terminal.kill).toHaveBeenCalled();
  });

  it("parses split ConPTY cursor moves and inline OSC hyperlinks without relaxing URL validation", async () => {
    const fake = fakeTerminal();
    const state = startLocalBrowserLogin("anthropic", "isolated-fixture-home");
    await vi.waitFor(() => expect(mocks.ptySpawn).toHaveBeenCalled());
    const rendered = `Browser didn't open? Use the url below to sign in (c to copy)\x1b]8;;${url}\x1b\\wrapped display\x1b]8;;\x1b\\\x1b[27;2HPaste\x1b[1Ccode\x1b[1Chere\x1b[1Cif\x1b[1Cprompted >`;
    for (let i = 0; i < rendered.length; i += 13) fake.data(rendered.slice(i, i + 13));
    expect(state.authorizationUrl).toBe(url);
    state.abort();
    await vi.waitFor(() => expect(state.outcome).toBe("failure"));
    expect(fake.terminal.kill).toHaveBeenCalledTimes(1);
    expect(state.readCredential?.()).toBeNull();
  });

  it("rejects a look-alike provider URL in ConPTY output", async () => {
    const fake = fakeTerminal();
    const state = startLocalBrowserLogin("anthropic", "isolated-fixture-home");
    await vi.waitFor(() => expect(mocks.ptySpawn).toHaveBeenCalled());
    fake.data(loginPrompt.replace("claude.com", "claude.com.evil.example"));
    expect(state.authorizationUrl).toBeUndefined();
    fake.exit(0);
    await vi.waitFor(() => expect(state.outcome).toBe("failure"));
    expect(state.readCredential?.()).toBeNull();
  });

  it("fails without exposing native module or provider errors", async () => {
    mocks.ptySpawn.mockImplementation(() => { throw new Error("private-fixture-output"); });
    const state = startLocalBrowserLogin("anthropic", "isolated-fixture-home");
    await vi.waitFor(() => expect(state.outcome).toBe("failure"));
    expect(state.readCredential?.()).toBeNull();
    expect(JSON.stringify(state)).not.toContain("private-fixture-output");
  });
});

afterEach(() => {
  Object.defineProperty(process, "platform", platformDescriptor);
  vi.unstubAllEnvs();
});

describe("local OpenAI browser login transport", () => {
  it.each(["stdout", "stderr"] as const)("parses Windows Codex's %s prompt in the isolated home", async (stream) => {
    vi.stubEnv("OPENAI_API_KEY", "ambient-fixture-key");
    vi.stubEnv("CODEX_API_KEY", "ambient-fixture-key");
    vi.stubEnv("CODEX_HOME", "ambient-fixture-home");
    const state = startLocalBrowserLogin("openai", "isolated-fixture-home");
    expect(mocks.spawn).toHaveBeenCalledWith("codex.exe", ["login", "--device-auth"],
      expect.objectContaining({
        windowsHide: true,
        env: expect.objectContaining({ CODEX_HOME: "isolated-fixture-home", OPENAI_API_KEY: "", CODEX_API_KEY: "" }),
      }));
    child[stream].write(prompt.slice(0, 20));
    child[stream].write(prompt.slice(20));
    expect(state.authorizationUrl).toBe(promptUrl);
    expect(state.code).toBe(promptCode);
    child.emit("close", 0);
    await vi.waitFor(() => expect(state.outcome).toBe("success"));
    expect(child.kill).toHaveBeenCalled();
  });

  it("reports a fixed failure when Codex cannot spawn", async () => {
    const state = startLocalBrowserLogin("openai", "isolated-fixture-home");
    child.emit("error", new Error("fixture-private-provider-output"));
    await vi.waitFor(() => expect(state.outcome).toBe("failure"));
    expect(state.authorizationUrl).toBeUndefined();
    expect(state.code).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain("fixture-private-provider-output");
  });

  it("stops the Windows Codex process when the attempt is cancelled", async () => {
    const state = startLocalBrowserLogin("openai", "isolated-fixture-home");
    state.abort();
    await vi.waitFor(() => expect(child.kill).toHaveBeenCalled());
    expect(state.outcome).toBe("failure");
    child.emit("close", null);
  });

  it("retains the Python PTY transport on Unix", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const state = startLocalBrowserLogin("openai", "isolated-fixture-home");
    expect(mocks.spawn).toHaveBeenCalledWith("python3",
      ["-u", "-c", expect.stringContaining("pty.fork()"), "codex", "login", "--device-auth"],
      expect.any(Object));
    child.stdout.write(prompt);
    expect(state.code).toBe(promptCode);
    child.emit("close", 0);
    await vi.waitFor(() => expect(state.outcome).toBe("success"));
  });
});
