import { describe, expect, it } from "bun:test";
import { sparkline, gradientText, boxTop, boxBottom, boxRow, badge, codeChangeBar } from "./effects.js";

describe("sparkline", () => {
  it("returns correct width", () => {
    expect(sparkline([1, 2, 3, 4, 5], 5).length).toBe(5);
  });

  it("returns empty for empty input", () => {
    expect(sparkline([], 5)).toBe("");
  });

  it("samples to target width", () => {
    const result = sparkline([1, 2, 3, 4, 5, 6, 7, 8], 4);
    expect(result.length).toBe(4);
  });

  it("uses spark characters", () => {
    const chars = "▁▂▃▄▅▆▇█";
    const result = sparkline([0, 50, 100], 3);
    for (const ch of result) {
      expect(chars).toContain(ch);
    }
  });

  it("handles single value", () => {
    const result = sparkline([42], 3);
    expect(result.length).toBe(3);
  });
});

describe("gradientText", () => {
  it("returns text of same length", () => {
    const result = gradientText("hello", [[255, 0, 0], [0, 255, 0]]);
    const visible = result.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible).toBe("hello");
  });

  it("contains ANSI codes", () => {
    const result = gradientText("ab", [[255, 0, 0], [0, 0, 255]]);
    expect(result).toContain("\x1b[38;2;");
  });

  it("handles single character", () => {
    const result = gradientText("x", [[255, 0, 0]]);
    expect(result).toContain("x");
  });
});

describe("box drawing", () => {
  it("boxTop has correct width", () => {
    const top = boxTop(10);
    const visible = top.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible.length).toBe(10);
    expect(visible.startsWith("╭")).toBe(true);
    expect(visible.endsWith("╮")).toBe(true);
  });

  it("boxBottom has correct width", () => {
    const bottom = boxBottom(10);
    const visible = bottom.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible.length).toBe(10);
    expect(visible.startsWith("╰")).toBe(true);
    expect(visible.endsWith("╯")).toBe(true);
  });

  it("boxRow has correct width", () => {
    const row = boxRow("hi", 10);
    const visible = row.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible.length).toBe(10);
    expect(visible.startsWith("│")).toBe(true);
    expect(visible.endsWith("│")).toBe(true);
  });
});

describe("badge", () => {
  it("contains text", () => {
    const result = badge("RUN", "\x1b[37m", [50, 50, 50]);
    expect(result).toContain("RUN");
  });

  it("has background color", () => {
    const result = badge("X", "\x1b[37m", [50, 50, 50]);
    expect(result).toContain("48;2;");
  });
});

describe("codeChangeBar", () => {
  it("returns empty for zero changes", () => {
    expect(codeChangeBar(0, 0, 10)).toBe("");
  });

  it("returns correct width", () => {
    const bar = codeChangeBar(5, 5, 10);
    const visible = bar.replace(/\x1b\[[0-9;]*m/g, "");
    expect(visible.length).toBe(10);
  });
});
