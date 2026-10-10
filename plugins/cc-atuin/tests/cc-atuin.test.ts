import { expect, test } from "claude-code/testing";

/**
 * Fire the mod's own events and stub the Atuin process, so these tests prove
 * the hooks run and wire up correctly without needing Claude Code or a real
 * Atuin database.
 *
 * Stub shapes follow the kit's rules: a mods API call answers `{ value }`,
 * while an event of Claude Code's own answers that event's result.
 */

/**
 * Answer `$.process.run` from a script and record every argv it was given.
 * `exitCode` is the field the mods API actually returns.
 */
function stubProcess(
  calls: string[][],
  script: (argv: string[]) => { exitCode: number; stdout: string; stderr: string },
) {
  // Mods API stubs take ($, e): the first argument is the test's own $.
  return (_$: unknown, e: { argv?: string[]; init?: { cwd?: string } }) => {
    const argv = e.argv ?? [];
    calls.push(argv);
    return { value: script(argv) };
  };
}

/** The stubs every test needs before it may touch `$`. */
function stubSession(on: (name: string, handler: unknown) => void, calls: string[][], script: (argv: string[]) => any) {
  on("session.start", () => ({ cwd: "/work" }));
  on("session.cwd", () => ({ value: "/work" }));
  on("command.register", () => ({ value: undefined }));
  on("process.run", stubProcess(calls, script));
  // The mod passes every event on, so Claude Code's own answer is needed.
  on("prompt.submit", ($: unknown, e: { text: string }) => ({ text: e.text }));
}

const ATUIN_OK = (argv: string[]) => {
  if (argv.includes("--version")) return { exitCode: 0, stdout: "atuin 18.23.0", stderr: "" };
  if (argv.includes("start")) return { exitCode: 0, stdout: "hist-1\n", stderr: "" };
  return { exitCode: 0, stdout: "", stderr: "" };
};

test("the version probe marks atuin available", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, ATUIN_OK);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.prompt.submit({ text: "hello" });

  // A write happened, which only occurs when the probe reported success.
  expect(calls.some((argv) => argv.includes("start"))).toBe(true);
});

test("a submitted prompt is written with the claude-code author", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, ATUIN_OK);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.prompt.submit({ text: "refactor the parser" });

  const start = calls.find((argv) => argv.includes("start"));
  expect(start).toContain("claude-code");
  expect(start).toContain("refactor the parser");

  const end = calls.find((argv) => argv.includes("end"));
  expect(end).toContain("hist-1");
});

test("a bash call is bracketed with start and end", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, ATUIN_OK);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "ls -la" });

  expect(calls.find((argv) => argv.includes("start"))).toContain("ls -la");
  expect(calls.find((argv) => argv.includes("end"))).toContain("hist-1");
});

test("a failing bash call records exit code 1", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, ATUIN_OK);
  on("tool.call", () => ({ isError: true, result: "boom" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "false" });

  const end = calls.find((argv) => argv.includes("end"));
  expect(end).toContain("1");
});

test("nothing is recorded when atuin is missing", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, (argv) => {
    if (argv.includes("start")) {
      // A write would only be attempted if the version probe had succeeded.
      throw new Error("start must not run when atuin is missing");
    }
    throw new Error("spawn atuin ENOENT");
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.prompt.submit({ text: "hello" });

  // Only the version probe ran; no history write was attempted.
  expect(calls.every((argv) => !argv.includes("start"))).toBe(true);
});

test("/history reports an empty history instead of opening a pane", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, (argv) => {
    if (argv.includes("--version")) return { exitCode: 0, stdout: "atuin 18.23.0", stderr: "" };
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "history", args: "" });

  expect(answer.text).toContain("No Atuin history yet");
});

test("/history opens the pane when history exists", async ($, on) => {
  const calls: string[][] = [];
  const opened: unknown[] = [];
  stubSession(on, calls, (argv) => {
    if (argv.includes("--version")) return { exitCode: 0, stdout: "atuin 18.23.0", stderr: "" };
    if (argv.includes("search")) {
      return {
        exitCode: 0,
        stdout: "2026-10-03 09:00:00\tgit status\n2026-10-03 09:05:00\tdocker ps\n",
        stderr: "",
      };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  on("ui.open", (_$, e: unknown) => {
    opened.push(e);
    return { value: { isPlaced: true } };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "history", args: "" });

  // Opening a pane returns no transcript text.
  expect(answer.text).toBeUndefined();
  expect(opened.length).toBe(1);
});

test("the pane draws the history rows it loaded", async ($, on) => {
  const calls: string[][] = [];
  stubSession(on, calls, (argv) => {
    if (argv.includes("--version")) return { exitCode: 0, stdout: "atuin 18.23.0", stderr: "" };
    if (argv.includes("search")) {
      return {
        exitCode: 0,
        stdout: "2026-10-03 09:00:00\tgit status\n2026-10-03 09:05:00\tdocker ps\n",
        stderr: "",
      };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  });
  on("ui.open", () => ({ value: { isPlaced: true } }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "history", args: "" });

  // Mounting the pane runs our ui.render hook for this render site.
  const ui = await $.ui.mount({
    plugin: "cc-atuin",
    surface: "terminal",
    component: "Pane",
    requestId: "cc-atuin",
    viewport: { columns: 100, rows: 30 },
    props: {
      title: "History",
      isFocused: true,
      bodyColumns: 60,
      placement: "inline",
      scroll: { offset: 0, bodyRows: 10 },
      view: {},
    },
  });

  expect(await ui.find({ type: "Button", text: /git status/ })).toBeDefined();
  expect(await ui.find({ type: "Button", text: /docker ps/ })).toBeDefined();
  await ui.unmount();
});
