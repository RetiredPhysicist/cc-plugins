import { expect, mock, test } from "claude-code/testing";

/**
 * Host-level tests: they load the mod, fire real events through its hooks, and
 * check what it drew or decided. Nothing here needs a session or a network.
 */

/** Stubs every test needs before it may touch `$`. */
function stubBase(
  on: (name: string, handler: unknown) => void,
  saved: Map<string, unknown>,
  overrides: {
    status?: () => string;
    contextPercent?: () => number;
    cwd?: () => string;
    counts?: () => string;
    fsExists?: (path: string) => boolean;
    fsList?: (path: string) => unknown[];
    settings?: () => unknown;
    config?: () => string;
  } = {},
) {
  on("session.start", () => ({ cwd: overrides.cwd?.() ?? "/work" }));
  on("session.cwd", () => ({ value: overrides.cwd?.() ?? "/work" }));
  on("command.register", () => ({ value: undefined }));
  on("store.get", (_$, e: { key: string }) => ({ value: saved.get(e.key) }));
  on("store.set", (_$, e: { key: string; value: unknown }) => {
    saved.set(e.key, e.value);
    return { value: undefined };
  });
  // Config is read through the mods API, so both need an answer.
  on("env.get", () => ({ value: "/home/test" }));
  on("fs.read", () => {
    if (overrides.config) return { value: overrides.config() };
    throw new Error("no config file");
  });
  on("fs.write", () => ({ value: undefined }));
  // The config row reads the same sources the statusline does. The kit has no
  // disk, so the defaults are "missing": every count starts at zero.
  on("fs.exists", (_$, e: { path?: string }) => ({
    value: overrides.fsExists ? overrides.fsExists(e?.path ?? "") : false,
  }));
  on("fs.list", (_$, e: { path?: string }) => {
    if (overrides.fsList) return { value: overrides.fsList(e?.path ?? "") };
    throw new Error("no directory");
  });
  on("settings.read", () => ({ value: overrides.settings ? overrides.settings() : {} }));
  on("process.run", (_$, e: { argv: string[] }) => ({
    value: e.argv.includes("--abbrev-ref")
      ? { exitCode: 0, stdout: "main\n", stderr: "" }
      : e.argv.includes("rev-list")
        ? { exitCode: 0, stdout: overrides.counts?.() ?? "0\t0\n", stderr: "" }
        : { exitCode: 0, stdout: overrides.status?.() ?? "", stderr: "" },
  }));
  on("session.end", () => ({}));
  // `session.measure` cannot be fired from the test kit; the context row is
  // exercised through the request tokens instead.
  // The band composes with later mods by nesting the result of `next(e)`, so
  // that event needs an answer. Echoing the suffix lets a test see what the
  // spinner hook appended.
  on("ui.render", (_$, e: { props?: { suffix?: string } }) => ({
    type: "Text",
    props: {},
    children: [e.props?.suffix || "other-mod"],
  }));
  on("session.usage", () => {
    const percent = overrides.contextPercent?.() ?? 42;
    return {
      value: { context: { percent, tokens: percent * 200, window: 20000 }, rateLimits: [], cost: null, startedAt: 0 },
    };
  });
  // `$.ui.invalidate` is answered by the test kit itself; stubbing it would
  // swallow the redraw and the pane would never re-render.
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("turn.start", (_$, e: { turnId: string }) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
}

/** One model request that streams three chunks and reports usage. */
async function fireStep($: any) {
  const stream = $.turn.step({ turnId: "t1", index: 0, model: "claude-test", messageCount: 1 });
  let step = await stream.next();
  while (step.done !== true) step = await stream.next();
  return step.value;
}

const STEP_STUB = async function* () {
  yield { kind: "text", index: 0, text: "he" };
  yield { kind: "text", index: 0, text: "llo" };
  return {
    turnId: "t1",
    index: 0,
    answer: "hello",
    toolUses: [],
    stopReason: "end_turn",
    usage: {
      input_tokens: 120,
      output_tokens: 40,
      cache_read_input_tokens: 800,
      cache_creation_input_tokens: 10,
      model: "claude-test",
    },
  };
};

test("the band draws the statusline rows before any turn", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });

  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 4,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 3 },
      view: {},
    },
  });

  // The project row carries the cwd and the branch.
  const project = JSON.stringify(await ui.find({ key: "row-project" }));
  expect(project).toContain("/work");
  expect(project).toContain("main");
  // Nothing has run, so the timing and activity rows are omitted entirely
  // rather than padded with placeholders.
  expect(await ui.find({ key: "row-timing" })).toBeUndefined();
  expect(await ui.find({ key: "row-activity" })).toBeUndefined();
  await ui.unmount();
});

test("a turn records measured timing and usage", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("turn.step", STEP_STUB);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await fireStep($);
  await $.turn.complete({
    turnId: "t1",
    answer: "hello",
    durationMs: 2000,
    isAborted: false,
    usage: { input_tokens: 120, output_tokens: 40, cache_read_input_tokens: 800, cache_creation_input_tokens: 10 },
  });

  // The ledger now holds one turn for today.
  const ledger = saved.get("ledger.v1") as any;
  expect(ledger).toBeDefined();
  const days = Object.values(ledger.days) as any[];
  expect(days.length).toBe(1);
  expect(days[0].turns).toBe(1);
  expect(days[0].outputTokens).toBe(40);
  expect(days[0].cacheReadTokens).toBe(800);
});

test("the pane shows measured metrics after a turn", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  const clock = mock.clock(on);
  on("turn.step", STEP_STUB);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await fireStep($);
  await clock.advance(1200);
  await $.turn.complete({ turnId: "t1", answer: "hello", durationMs: 1200, isAborted: false, usage: null });

  await $.command.run({ command: "shannon", args: "" });
  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "Pane",
    requestId: "cc-shannon",
    viewport: { columns: 120, rows: 40 },
    props: {
      title: "Shannon",
      isFocused: true,
      bodyColumns: 100,
      placement: "inline",
      scroll: { offset: 0, bodyRows: 16 },
      view: {},
    },
  });

  // Container keys survive into the drawing; nested Text keys do not, so read
  // the rows by their container key and match on the rendered text.
  const timing = JSON.stringify(await ui.find({ key: "row-timing" }));
  expect(timing).toContain("TTFT");
  expect(timing).toContain("req");
  // Output tokens appear on the context row.
  const context = JSON.stringify(await ui.find({ key: "row-context" }));
  expect(context).toContain("40");
  await ui.unmount();
});

test("the pane includes the extended rows", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "npm test" });
  await $.command.run({ command: "q", args: "next prompt" });

  const ui = await mountPane($);
  expect(await ui.find({ key: "row-queue" })).toBeDefined();
  expect(await ui.find({ key: "row-companion" })).toBeDefined();
  expect(await ui.find({ key: "row-latency" })).toBeDefined();
  expect(await ui.find({ key: "tool-0" })).toBeDefined();
  await ui.unmount();
});

test("the Today tab summarizes the ledger", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("turn.step", STEP_STUB);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await fireStep($);
  await $.turn.complete({ turnId: "t1", answer: "hello", durationMs: 1000, isAborted: false, usage: null });

  await $.command.run({ command: "shannon", args: "" });
  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "Pane",
    requestId: "cc-shannon",
    viewport: { columns: 120, rows: 40 },
    props: {
      title: "Shannon",
      isFocused: true,
      bodyColumns: 100,
      placement: "inline",
      scroll: { offset: 0, bodyRows: 16 },
      view: {},
    },
  });

  // Today's rollup is on the same screen as the live rows.
  const today = JSON.stringify(await ui.find({ key: "row-today" }));
  expect(today).toContain("turns");
  expect(today).toContain("cache");
  await ui.unmount();
});

/**
 * `$.ui.ask` reaches `tool.call` as a call to the AskUserQuestion tool, so a
 * test approves or refuses by answering that tool, not by stubbing `ui.ask`.
 */
function stubDialog(on: any, answer: string, asked: string[]) {
  on("tool.call", (_$: unknown, e: { tool: string; questions?: { question: string }[] }) => {
    if (e.tool === "AskUserQuestion") {
      const question = e.questions?.[0]?.question ?? "";
      asked.push(question);
      return { result: { answers: { [question]: answer } } };
    }
    return { result: "ok" };
  });
}

test("the guard asks before a risky command and allows it when approved", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Run it", asked);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "rm -rf build" });

  expect(asked.length).toBe(1);
  expect(asked[0]).toContain("recursive delete");
});

test("the guard blocks a risky command when refused", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Refuse", asked);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const result = await $.tool.call({ tool: "Bash", command: "git push --force origin main" });

  expect(result.deny).toContain("Blocked by cc-shannon guard");
  // The refusal must tell the model a person declined, so it does not simply
  // rewrite the command.
  expect(result.deny).toContain("Do not retry it in another form");
});

test("the guard fails safe when nobody answers", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  // A dialog stub that reports no answer, which is what `claude -p` does.
  on("tool.call", (_$: unknown, e: { tool: string; questions?: { question: string }[] }) => {
    if (e.tool === "AskUserQuestion") return { result: { answers: {} } };
    return { result: "should not run" };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const result = await $.tool.call({ tool: "Bash", command: "rm -rf /" });

  expect(result.deny).toContain("Blocked by cc-shannon guard");
});

test("the guard leaves an ordinary command alone", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Run it", asked);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const result = await $.tool.call({ tool: "Bash", command: "npm test" });

  expect(asked.length).toBe(0);
  expect(result).toBeDefined();
});

test("the guard raises a native notification when the setting is on", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved, { config: () => JSON.stringify({ notify: true }) });
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Run it", asked);
  const notices: string[] = [];
  on("ui.notify", (_$, e: { text?: string } | string) => {
    notices.push(typeof e === "string" ? e : String(e?.text ?? ""));
    return { value: { isSent: true, channel: "terminal_bell" } };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "rm -rf build" });

  expect(notices.length).toBe(1);
  expect(notices[0]).toContain("cc-shannon guard");
  expect(notices[0]).toContain("rm -rf build");
});

test("no notification is raised when the setting is off", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Run it", asked);
  const notices: string[] = [];
  on("ui.notify", () => {
    notices.push("called");
    return { value: { isSent: true, channel: "terminal_bell" } };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "rm -rf build" });

  expect(notices.length).toBe(0);
});

test("a host that cannot notify still runs the guard", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved, { config: () => JSON.stringify({ notify: true }) });
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Run it", asked);
  // No `ui.notify` handler at all: an older Claude Code with no such call.

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "rm -rf build" });

  // The guard still asked, and the approved command still ran.
  expect(asked.length).toBe(1);
});

test("shannon-guard toggles the guard off", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  const asked: string[] = [];
  stubDialog(on, "Run it", asked);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "shannon-guard", args: "" });
  expect(answer.text).toContain("off");

  await $.tool.call({ tool: "Bash", command: "rm -rf /tmp/x" });
  expect(asked.length).toBe(0);
});

test("the rain strip draws the statusline's six columns per band row", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });

  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 4,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 3 },
      view: {},
    },
  });

  // Rain is on by default and wraps the band, so the strip and the content
  // share one row container.
  const rain = await ui.find({ key: "rain" });
  expect(rain).toBeDefined();
  const strip = await ui.find({ key: "rain-strip" });
  expect(strip).toBeDefined();
  // One cell per band row.
  const stripRows = strip?.children ?? [];
  expect(stripRows.length).toBeGreaterThan(0);
  // Every row falls in RAIN_COLS columns, not a single cell.
  for (const stripRow of stripRows) {
    expect((stripRow.children ?? []).length).toBe(6);
  }
  await ui.unmount();
});

test("shannon-rain turns the strip off and stores the choice", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "shannon-rain", args: "" });
  expect(answer.text).toContain("off");
});

test("finished tools are counted, with failures separated", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", (_$, e: { tool: string }) =>
    e.tool === "Bash" ? { result: "ok" } : { isError: true, result: "boom" });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "npm test" });
  await $.tool.call({ tool: "Read", file_path: "/tmp/x" });

  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 6,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    },
  });

  const counters = JSON.stringify(await ui.find({ key: "row-counters" }));
  expect(counters).toContain("✔ 2");
  expect(counters).toContain("1");
  await ui.unmount();
});

test("finished tools contribute a latency row", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  const clock = mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  // `$.clock.now()` is not driven by `mock.clock` here, so assert the row is
  // populated rather than pinning an exact duration.
  await $.tool.call({ tool: "Bash", command: "sleep 5" });

  const band = await mountBand($);
  const latency = JSON.stringify(await band.find({ key: "row-latency" }));
  expect(latency).toContain("Bash");
  expect(latency).toContain("0ms");
  await band.unmount();
});

test("the latency row can be turned off", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "true" });
  const answer = await $.command.run({ command: "shannon-toggle", args: "latency" });
  expect(answer.text).toContain("off");

  const band = await mountBand($);
  expect(await band.find({ key: "row-latency" })).toBeUndefined();
  await band.unmount();
});

test("a running tool is reported while it runs", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  on("tool.call", async (_$, e: { tool: string }) => {
    if (e.tool === "Bash") await held;
    return { result: "ok" };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const call = $.tool.call({ tool: "Bash", command: "sleep 5" });

  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: true,
      maxRows: 6,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    },
  });

  const activity = JSON.stringify(await ui.find({ key: "row-activity" }));
  expect(activity).toContain("Bash");
  expect(activity).toContain("sleep 5");

  await ui.unmount();
  release();
  await call;
});

test("a spawned subagent is listed while it runs", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  // A spawn hook answers with the model to use, or a denial.
  on("agent.spawn", () => ({ model: "claude-test" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.agent.spawn({ tool_use_id: "a1", subagentType: "Explore", model: "claude-test", prompt: "look around" });

  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: true,
      maxRows: 6,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    },
  });

  const agents = JSON.stringify(await ui.find({ key: "row-agents" }));
  expect(agents).toContain("Explore");
  expect(agents).toContain("[claude-test]");
  await ui.unmount();
});

test("the spinner keeps its own text and gains live progress", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "npm test" });

  const spinner = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "Spinner",
    requestId: "s1",
    viewport: { columns: 120, rows: 40 },
    props: { word: "Thinking", message: null, suffix: "", mode: "thinking" },
  });
  const text = JSON.stringify(await spinner.find({ type: "Text" }));
  expect(text).toContain("1 tool");
  await spinner.unmount();
});

test("a hint appears only when something needs attention", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ isError: true, result: "boom" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const quiet = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 6,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    },
  });
  // Nothing has failed yet, so no hint row exists.
  expect(await quiet.find({ key: "row-hint" })).toBeUndefined();
  await quiet.unmount();

  await $.tool.call({ tool: "Bash", command: "false" });
  await $.tool.call({ tool: "Bash", command: "false" });

  const loud = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: 6,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: 6 },
      view: {},
    },
  });
  const hint = JSON.stringify(await loud.find({ key: "row-hint" }));
  expect(hint).toContain("different approach");
  await loud.unmount();
});

test("the ledger survives a new session", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("turn.step", STEP_STUB);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await fireStep($);
  await $.turn.complete({ turnId: "t1", answer: "hello", durationMs: 1000, isAborted: false, usage: null });

  // A second session reads what the first one saved.
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "Pane",
    requestId: "cc-shannon",
    viewport: { columns: 120, rows: 40 },
    props: {
      title: "Shannon",
      isFocused: true,
      bodyColumns: 100,
      placement: "inline",
      scroll: { offset: 0, bodyRows: 16 },
      view: {},
    },
  });
  // The prior session's turn is still in the ledger.
  const today = JSON.stringify(await ui.find({ key: "row-today" }));
  expect(today).toContain("turns");
  await ui.unmount();
});

test("a turn refreshes the git row", async ($, on) => {
  const saved = new Map<string, unknown>();
  let status = "";
  stubBase(on, saved, { status: () => status });
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const before = await mountBand($);
  expect(JSON.stringify(await before.find({ key: "row-project" }))).not.toContain("*");
  await before.unmount();

  status = "?? new-file\n";
  await $.turn.complete({ turnId: "t1", answer: "", durationMs: 100, isAborted: false, usage: null });

  const after = await mountBand($);
  expect(JSON.stringify(await after.find({ key: "row-project" }))).toContain("*");
  await after.unmount();
});

test("the project row shortens the path the way the statusline does", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved, { cwd: () => "/home/test/Documents/workbuddy/cc-plugins" });
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await mountBand($);

  const project = JSON.stringify(await ui.find({ key: "row-project" }));
  // `~` for home, then one initial per leading segment; the tail segment stays.
  expect(project).toContain("~/D/w/cc-plugins");
  expect(project).not.toContain("/home/test/Documents");
  await ui.unmount();
});

test("the git row carries ahead, behind and file counts", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved, {
    status: () => "?? new\n M edit\nA  added\n D gone\n",
    counts: () => "2\t3\n",
  });
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await mountBand($);

  const project = JSON.stringify(await ui.find({ key: "row-project" }));
  expect(project).toContain("↑3");
  expect(project).toContain("↓2");
  expect(project).toContain("!1");
  expect(project).toContain("+1");
  expect(project).toContain("✘1");
  expect(project).toContain("?1");
  await ui.unmount();
});

test("finished tools are counted by name", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Read", file_path: "/tmp/a" });
  await $.tool.call({ tool: "Read", file_path: "/tmp/b" });

  const ui = await mountBand($);
  const counts = JSON.stringify(await ui.find({ key: "row-tool-counts" }));
  expect(counts).toContain("Read");
  expect(counts).toContain("×2");
  await ui.unmount();
});

test("a TodoWrite call becomes the todo row", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({
    tool: "TodoWrite",
    todos: [
      { content: "write the tests", status: "completed" },
      { content: "ship it", status: "in_progress" },
    ],
  });

  const ui = await mountBand($);
  const todos = JSON.stringify(await ui.find({ key: "row-todos" }));
  expect(todos).toContain("write the tests");
  expect(todos).toContain("ship it");
  expect(todos).toContain("1/2");
  await ui.unmount();
});

test("the config row counts CLAUDE.md, MCPs, hooks and skills", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved, {
    fsExists: () => true,
    fsList: (path) =>
      path.endsWith("/rules")
        ? [
            { name: "a.mdc", kind: "file" },
            { name: "b.mdc", kind: "file" },
            { name: "notes.txt", kind: "file" },
          ]
        : [
            { name: "one", kind: "dir" },
            { name: "two", kind: "dir" },
          ],
    settings: () => ({ mcpServers: { a: {}, b: {}, c: {} }, hooks: { PreToolUse: [], Stop: [] } }),
  });
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await mountBand($, 12);

  const config = JSON.stringify(await ui.find({ key: "row-config" }));
  expect(config).toContain("CLAUDE.md");
  expect(config).toContain("rules");
  expect(config).toContain("MCPs");
  expect(config).toContain("hooks");
  expect(config).toContain("Skills");
  await ui.unmount();
});

/** Mount the band, which is where the compact rows live. */
async function mountBand($: any, rows = 8) {
  return $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "AbovePrompt",
    requestId: "band",
    viewport: { columns: 120, rows: 40 },
    props: {
      hasSurvey: false,
      isWorking: false,
      maxRows: rows,
      bodyColumns: 100,
      scroll: { offset: 0, bodyRows: rows },
      view: {},
    },
  });
}

/** Mount the `/shannon` pane. */
async function mountPane($: any, rows = 24) {
  return $.ui.mount({
    plugin: "cc-shannon-mod",
    surface: "terminal",
    component: "Pane",
    requestId: "cc-shannon",
    viewport: { columns: 120, rows: 40 },
    props: {
      title: "Shannon",
      isFocused: true,
      bodyColumns: 100,
      placement: "inline",
      scroll: { offset: 0, bodyRows: rows },
      view: {},
    },
  });
}

test("a passing test run feeds the companion", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "npm test" });

  const pet = saved.get("companion.v1") as any;
  expect(pet).toBeDefined();
  expect(pet.tests).toBe(1);
  expect(pet.xp).toBe(1);

  const band = await mountBand($);
  const line = JSON.stringify(await band.find({ key: "row-companion" }));
  expect(line).toContain("Lv1");
  expect(line).toContain("✔1");
  await band.unmount();
});

test("a failing test run does not feed the companion", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ isError: true, result: "1 failing" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "npm test" });

  // The pet exists but did not grow: a red build is not food.
  const pet = saved.get("companion.v1") as any;
  expect(pet.xp).toBe(0);
  expect(pet.tests).toBe(0);
});

test("a commit feeds the companion more than a test run", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.tool.call({ tool: "Bash", command: "git commit -m 'green'" });

  const pet = saved.get("companion.v1") as any;
  expect(pet.commits).toBe(1);
  expect(pet.xp).toBe(3);
});

test("the companion hides when it has never been fed", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const band = await mountBand($);
  expect(await band.find({ key: "row-companion" })).toBeUndefined();
  await band.unmount();
});

test("a queued prompt is listed and sent when the turn ends", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);
  const submitted: string[] = [];
  on("prompt.submit", (_$, e: { text: string }) => {
    submitted.push(e.text);
    return { text: e.text };
  });

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const queued = await $.command.run({ command: "q", args: "run the tests" });
  expect(queued.text).toContain("Queued");

  const band = await mountBand($);
  const row = JSON.stringify(await band.find({ key: "row-queue" }));
  expect(row).toContain("run the tests");
  await band.unmount();

  // Ending a turn releases one queued prompt.
  await $.turn.complete({ turnId: "t1", answer: "", durationMs: 100, isAborted: false, usage: null });
  expect(submitted).toContain("run the tests");
});

test("the queue can be viewed, reordered and dropped", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "q", args: "first" });
  await $.command.run({ command: "q", args: "second" });

  const list = await $.command.run({ command: "shannon-queue", args: "list" });
  expect(list.text).toContain("first");
  expect(list.text).toContain("second");

  const moved = await $.command.run({ command: "shannon-queue", args: "up 2" });
  expect(moved.text).toContain("2 waiting");

  const band = await mountBand($);
  const row = JSON.stringify(await band.find({ key: "row-queue" }));
  // Moving item 2 up made "second" the head.
  expect(row).toContain("second");
  await band.unmount();

  const dropped = await $.command.run({ command: "shannon-queue", args: "drop 1" });
  expect(dropped.text).toContain("1 waiting");
});

test("the queue toggle turns queueing off", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "shannon-toggle", args: "queue" });
  expect(answer.text).toContain("off");

  const refused = await $.command.run({ command: "q", args: "nope" });
  expect(refused.text).toContain("queue is off");
});

test("an unknown toggle name is reported instead of ignored", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "shannon-toggle", args: "nonsense" });
  expect(answer.text).toContain("Usage");
});

test("the lens row stays hidden until growth is known", async ($, on) => {
  const saved = new Map<string, unknown>();
  stubBase(on, saved);
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });

  // `session.measure` cannot be fired from the test kit, so the sampled
  // history stays empty here. The row must not claim a runway it has not
  // measured — the growth math itself is covered by the unit tests.
  const band = await mountBand($);
  expect(await band.find({ key: "row-lens" })).toBeUndefined();
  await band.unmount();
});

test("a turn samples context so the lens can show growth", async ($, on) => {
  const saved = new Map<string, unknown>();
  let percent = 20;
  stubBase(on, saved, { contextPercent: () => percent });
  mock.clock(on);

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.turn.complete({ turnId: "t1", answer: "", durationMs: 100, isAborted: false, usage: null });

  percent = 30;
  await $.turn.complete({ turnId: "t2", answer: "", durationMs: 100, isAborted: false, usage: null });

  const band = await mountBand($);
  const lens = JSON.stringify(await band.find({ key: "row-lens" }));
  expect(lens).toContain("%/turn");
  await band.unmount();
});
