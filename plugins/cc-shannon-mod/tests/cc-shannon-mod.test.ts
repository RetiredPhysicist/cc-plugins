import { expect, mock, test } from "claude-code/testing";

/**
 * Host-level tests: they load the mod, fire real events through its hooks, and
 * check what it drew or decided. Nothing here needs a session or a network.
 */

/** Stubs every test needs before it may touch `$`. */
function stubBase(
  on: (name: string, handler: unknown) => void,
  saved: Map<string, unknown>,
) {
  on("session.start", () => ({ cwd: "/work" }));
  on("command.register", () => ({ value: undefined }));
  on("store.get", (_$, e: { key: string }) => ({ value: saved.get(e.key) }));
  on("store.set", (_$, e: { key: string; value: unknown }) => {
    saved.set(e.key, e.value);
    return { value: undefined };
  });
  on("session.end", () => ({}));
  // `session.measure` cannot be stubbed by the test kit, so the context
  // percentage is exercised through the usage API in a separate test.
  // The band composes with later mods by nesting the result of `next(e)`, so
  // that event needs an answer.
  on("ui.render", () => ({ type: "Text", props: {}, children: ["other-mod"] }));
  on("session.usage", () => ({ value: { context: { percent: 42, tokens: 8400, window: 20000 }, rateLimits: [], cost: null, startedAt: 0 } }));
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

test("the band draws a compact surface before any turn", async ($, on) => {
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

  expect(await ui.find({ type: "Text", text: /shannon/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /measuring/ })).toBeDefined();
  // Nothing is running, so the activity row is omitted rather than spending a
  // line on "idle".
  expect(await ui.find({ type: "Text", text: /↻/ })).toBeUndefined();
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

test("the Now tab shows measured metrics after a turn", async ($, on) => {
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
  // the stat rows by their container key and match on the rendered text.
  const requests = await ui.find({ key: "stat-requests" });
  expect(JSON.stringify(requests)).toContain("requests");
  expect(await ui.find({ key: "stat-ttft" })).toBeDefined();
  // Output tokens were recorded for the session.
  const output = await ui.find({ key: "stat-output" });
  expect(JSON.stringify(output)).toContain("40");
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

  // Switch to the Today tab and read it back.
  await ui.press({ key: "tab-today" });
  const body = JSON.stringify(await ui.find({ key: "body" }));
  expect(body).toContain("Today");
  expect(body).toContain("Last 7 days");
  expect(body).toContain("output tokens");
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
  await ui.press({ key: "tab-today" });
  // The prior session's turn is still in the ledger.
  const body = JSON.stringify(await ui.find({ key: "body" }));
  expect(body).not.toContain("no turns recorded yet");
  expect(body).toContain("Today");
  await ui.unmount();
});
