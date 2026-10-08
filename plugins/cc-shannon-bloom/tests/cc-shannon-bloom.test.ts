import { expect, mock, test } from "claude-code/testing";

/**
 * Host-level tests: they load the plugin, fire real events through its hooks,
 * and read what it drew. Nothing here needs a session or a network.
 */

/** Stubs every test needs before it may touch `$`. */
function stubBase(
  on: (name: string, handler: unknown) => void,
  overrides: { cwd?: () => string } = {},
) {
  on("session.start", () => ({ cwd: overrides.cwd?.() ?? "/work/alpha" }));
  on("session.id", () => ({ value: "s-main" }));
  on("session.cwd", () => ({ value: overrides.cwd?.() ?? "/work/alpha" }));
  on("env.get", () => ({ value: "/home/test" }));
  on("command.register", () => ({ value: undefined }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("turn.start", (_$, e: { turnId: string }) => ({ turnId: e.turnId }));
  on("turn.complete", () => ({ text: "" }));
  on("session.end", () => ({}));
}

/** Mount the Bloom pane the way the engine does. */
async function mountPane($: any, columns = 100, rows = 30) {
  return $.ui.mount({
    plugin: "cc-shannon-bloom",
    surface: "terminal",
    component: "Pane",
    requestId: "cc-shannon-bloom",
    viewport: { columns, rows },
    props: {
      title: "Bloom",
      isFocused: true,
      bodyColumns: columns - 4,
      placement: "inline",
      scroll: { offset: 0, bodyRows: rows - 4 },
      view: {},
    },
  });
}

test("the pane draws a header, a map and an activity strip", async ($, on) => {
  stubBase(on);
  mock.clock(on);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/alpha" });

  const ui = await mountPane($);
  const pane = await ui.find({ key: "cc-shannon-bloom-pane" });
  expect(pane).toBeDefined();
  // The header and strip are Text; the map is a Raster. A key matches any tag.
  expect(await ui.find({ type: "Raster" })).toBeDefined();
  const text = JSON.stringify(await ui.findAll({ type: "Text" }));
  expect(text).toContain("sessions");
  expect(text).toContain("tools");
  await ui.unmount();
});

test("the map raster carries a full cell grid", async ($, on) => {
  stubBase(on);
  mock.clock(on);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/alpha" });

  const ui = await mountPane($);
  const raster = await ui.find({ type: "Raster" });
  expect(raster).toBeDefined();
  const props = (raster as any)?.props ?? {};
  expect(typeof props.cells).toBe("string");
  expect(props.columns).toBeGreaterThan(0);
  expect(props.rows).toBeGreaterThan(0);
  // A cell is 12 bytes; base64 is 4 chars per 3 bytes, padded.
  const expected = Math.ceil((props.columns * props.rows * 12) / 3) * 4;
  expect(props.cells.length).toBe(expected);
  await ui.unmount();
});

test("the header names the session counters", async ($, on) => {
  stubBase(on);
  mock.clock(on);
  on("tool.call", () => ({ result: "ok" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/alpha" });
  await $.turn.start({ text: "hello", turnId: "t1" });
  await $.tool.call({ tool: "Read", file_path: "/work/alpha/readme.md" });
  await $.turn.complete({ turnId: "t1", answer: "hi", durationMs: 10, isAborted: false, usage: null });

  const ui = await mountPane($);
  const header = JSON.stringify(await ui.findAll({ type: "Text" }));
  expect(header).toContain("sessions");
  expect(header).toContain("tools");
  await ui.unmount();
});

test("a spawned subagent gets its own node", async ($, on) => {
  stubBase(on);
  mock.clock(on);
  on("agent.spawn", () => ({ agentId: "a1", model: "claude-test" }));

  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/alpha" });
  await $.turn.start({ text: "go", turnId: "t1" });
  await $.agent.spawn({
    tool_use_id: "a1",
    subagentType: "Explore",
    prompt: "look",
    parentModel: "claude-test",
  });
  await $.turn.complete({ turnId: "t1", answer: "", durationMs: 5, isAborted: false, usage: null });

  const ui = await mountPane($);
  // The header counts the subagent the moment it is born.
  const header = JSON.stringify(await ui.findAll({ type: "Text" }));
  expect(header).toContain("agents");
  await ui.unmount();
});

test("the /bloom command opens the pane", async ($, on) => {
  stubBase(on);
  mock.clock(on);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/alpha" });
  const answer = await $.command.run({ command: "bloom", args: "" });
  expect(answer.text).toContain("Bloom");
});

test("a session with no events still draws a sky", async ($, on) => {
  stubBase(on);
  mock.clock(on);
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work/alpha" });
  const ui = await mountPane($, 60, 16);
  const raster = await ui.find({ type: "Raster" });
  expect(raster).toBeDefined();
  await ui.unmount();
});
