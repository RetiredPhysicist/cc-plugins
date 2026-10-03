import { describe, expect, it } from "bun:test";
import { renderPowerline } from "./render-powerline.js";
import type { ConfigCounts, GitStatus, StdinData, TranscriptData } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const orig = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(" "));
  try { fn(); } finally { console.log = orig; }
  return lines;
}

function makeStdin(overrides: Partial<StdinData> = {}): StdinData {
  return {
    workspace: { current_dir: "/tmp/test", project_dir: "/tmp/test" },
    model: { display_name: "Claude Sonnet 4" },
    context_window: { used_percentage: 30 },
    ...overrides,
  };
}

const emptyTranscript: TranscriptData = {
  tools: [],
  toolCounts: {},
  agents: [],
  todos: [],
  fileActivity: [],
  sessionStart: null,
  throughput: null,
};

const emptyConfig: ConfigCounts = {
  claudeMd: 0,
  rules: 0,
  mcp: 0,
  hooks: 0,
  skills: 0,
};

// ── Lean rendering ───────────────────────────────────────────

describe("renderPowerline — lean style", () => {
  it("renders one line with · separators", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("\u00b7");
  });

  it("no background colors (lean = text only)", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines[0]).not.toContain("\x1b[48;2;");
  });

  it("has foreground color codes", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines[0]).toContain("\x1b[38;2;");
  });
});

// ── Segment content ──────────────────────────────────────────

describe("renderPowerline — segments", () => {
  it("shows dir", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("test");
  });

  it("shows model", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("Sonnet");
  });

  it("shows the live model id when the display name is an alias", () => {
    const lines = capture(() =>
      renderPowerline(
        makeStdin({ model: { display_name: "Deepseek-V4-Pro", id: "ttsw-cc-balanced[1M]" } }),
        emptyTranscript,
        null,
        emptyConfig,
        "",
        { nerdFont: false },
      ),
    );
    expect(stripAnsi(lines[0])).toContain("Deepseek-V4-Pro · ttsw-cc-balanced[1M]");
  });

  it("shows git branch", () => {
    const git: GitStatus = { branch: "main", isDirty: false, ahead: 0, behind: 0, fileStats: null };
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, git, emptyConfig, "", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("main");
  });

  it("shows dirty mark", () => {
    const git: GitStatus = { branch: "feat", isDirty: true, ahead: 0, behind: 0, fileStats: null };
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, git, emptyConfig, "", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("!");
  });

  it("shows ahead/behind", () => {
    const git: GitStatus = { branch: "main", isDirty: false, ahead: 3, behind: 1, fileStats: null };
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, git, emptyConfig, "", { nerdFont: false }),
    );
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain("\u21913");
    expect(plain).toContain("\u21931");
  });

  it("shows ctx bar + percentage", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain("30%");
    expect(plain).toContain("#");
  });

  it("shows token counts when usage provided", () => {
    const stdin = makeStdin({
      context_window: {
        used_percentage: 30,
        current_usage: { input_tokens: 84000, output_tokens: 12000 },
      },
    });
    const lines = capture(() =>
      renderPowerline(stdin, emptyTranscript, null, emptyConfig, "", { nerdFont: false }),
    );
    const plain = stripAnsi(lines[0]);
    expect(plain).toContain("\u2191");
    expect(plain).toContain("\u2193");
  });

  it("shows session duration", () => {
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, null, emptyConfig, "2h 15m", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("2h 15m");
  });

  it("shows tool counts (same line)", () => {
    const transcript: TranscriptData = {
      ...emptyTranscript,
      tools: [
        { id: "1", name: "Read", target: null, status: "completed", startTime: new Date() },
        { id: "2", name: "Read", target: null, status: "completed", startTime: new Date() },
        { id: "3", name: "Edit", target: null, status: "completed", startTime: new Date() },
      ],
    };
    const lines = capture(() =>
      renderPowerline(makeStdin(), transcript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines.length).toBe(1);
    expect(stripAnsi(lines[0])).toContain("Read\u00d72");
    expect(stripAnsi(lines[0])).toContain("Edit");
  });

  it("shows todo progress (same line)", () => {
    const transcript: TranscriptData = {
      ...emptyTranscript,
      todos: [
        { content: "a", status: "completed" },
        { content: "b", status: "in_progress" },
        { content: "c", status: "pending" },
      ],
    };
    const lines = capture(() =>
      renderPowerline(makeStdin(), transcript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines.length).toBe(1);
    expect(stripAnsi(lines[0])).toContain("1/3");
  });

  it("shows running agents (same line)", () => {
    const transcript: TranscriptData = {
      ...emptyTranscript,
      agents: [{ id: "a1", type: "explore", model: null, description: null, status: "running", startTime: new Date() }],
    };
    const lines = capture(() =>
      renderPowerline(makeStdin(), transcript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines.length).toBe(1);
    expect(stripAnsi(lines[0])).toContain("explore");
  });

  it("shows running tools (same line)", () => {
    const transcript: TranscriptData = {
      ...emptyTranscript,
      tools: [{ id: "1", name: "Bash", target: null, status: "running", startTime: new Date() }],
    };
    const lines = capture(() =>
      renderPowerline(makeStdin(), transcript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(lines.length).toBe(1);
    expect(stripAnsi(lines[0])).toContain("Bash");
  });

  it("shows response throughput (same line)", () => {
    const transcript: TranscriptData = {
      ...emptyTranscript,
      throughput: {
        ttftMs: 1240,
        responseDurationMs: 5000,
        outputTokens: 312,
        tokensPerSecond: 62.4,
      },
    };
    const lines = capture(() =>
      renderPowerline(makeStdin(), transcript, null, emptyConfig, "", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("> TTFT 1.24s");
    expect(stripAnsi(lines[0])).toContain("Decode ~62.4 tok/s");
  });

  it("hides response throughput when disabled", () => {
    const transcript: TranscriptData = {
      ...emptyTranscript,
      throughput: {
        ttftMs: 1240,
        responseDurationMs: 5000,
        outputTokens: 312,
        tokensPerSecond: 62.4,
      },
    };
    const lines = capture(() =>
      renderPowerline(makeStdin(), transcript, null, emptyConfig, "", { nerdFont: false, throughput: false }),
    );
    expect(stripAnsi(lines[0])).not.toContain("TTFT");
  });
});

// ── Nerd Font toggle ─────────────────────────────────────────

describe("renderPowerline — nerdFont", () => {
  it("uses Nerd Font glyphs when enabled", () => {
    const git: GitStatus = { branch: "main", isDirty: false, ahead: 0, behind: 0, fileStats: null };
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, git, emptyConfig, "", { nerdFont: true }),
    );
    expect(lines[0]).toContain("\ue0a0");
  });

  it("uses ASCII fallback when disabled", () => {
    const git: GitStatus = { branch: "main", isDirty: false, ahead: 0, behind: 0, fileStats: null };
    const lines = capture(() =>
      renderPowerline(makeStdin(), emptyTranscript, git, emptyConfig, "", { nerdFont: false }),
    );
    expect(stripAnsi(lines[0])).toContain("#");
  });
});
