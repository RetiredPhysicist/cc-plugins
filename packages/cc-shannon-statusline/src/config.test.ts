import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getConfigPath, loadConfig } from "./config.js";

function makeHome(): string {
  const home = mkdtempSync(join(tmpdir(), "cc-shannon-statusline-config-"));
  mkdirSync(join(home, ".shannon", "cc-shannon-statusline"), { recursive: true });
  return home;
}

describe("loadConfig", () => {
  it("defaults to rain and throughput enabled", () => {
    const home = makeHome();
    expect(loadConfig(home)).toEqual({ rain: true, throughput: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("respects rain false", () => {
    const home = makeHome();
    writeFileSync(getConfigPath(home), JSON.stringify({ rain: false }));
    expect(loadConfig(home)).toEqual({ rain: false, throughput: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("ignores invalid values and malformed JSON", () => {
    const home = makeHome();
    writeFileSync(getConfigPath(home), JSON.stringify({ rain: "no", throughput: "no" }));
    expect(loadConfig(home)).toEqual({ rain: true, throughput: true });
    writeFileSync(getConfigPath(home), "{ broken");
    expect(loadConfig(home)).toEqual({ rain: true, throughput: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("respects throughput false", () => {
    const home = makeHome();
    writeFileSync(getConfigPath(home), JSON.stringify({ throughput: false }));
    expect(loadConfig(home)).toEqual({ rain: true, throughput: false });
    rmSync(home, { recursive: true, force: true });
  });

  it("falls back to the pre-rename config path", () => {
    const home = mkdtempSync(join(tmpdir(), "cc-shannon-statusline-legacy-"));
    const legacyDir = join(home, ".shannon", "shannon-statusline");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "config.json"), JSON.stringify({ rain: false }));

    expect(getConfigPath(home)).toBe(join(legacyDir, "config.json"));
    expect(loadConfig(home)).toEqual({ rain: false, throughput: true });
    rmSync(home, { recursive: true, force: true });
  });

  it("prefers the current path once it exists", () => {
    const home = makeHome();
    const legacyDir = join(home, ".shannon", "shannon-statusline");
    mkdirSync(legacyDir, { recursive: true });
    writeFileSync(join(legacyDir, "config.json"), JSON.stringify({ rain: false }));
    writeFileSync(getConfigPath(home), JSON.stringify({ rain: true }));

    expect(loadConfig(home)).toEqual({ rain: true, throughput: true });
    rmSync(home, { recursive: true, force: true });
  });
});
