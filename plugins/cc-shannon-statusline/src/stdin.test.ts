import { describe, expect, it } from "bun:test";
import { getModelId, getModelName } from "./stdin.js";

describe("model fields", () => {
  it("keeps the display name as the primary label", () => {
    expect(getModelName({ model: { display_name: "Opus", id: "claude-opus-4-6" } })).toBe("Opus");
  });

  it("returns the id when it carries the current model variant", () => {
    expect(getModelId({ model: { display_name: "Deepseek-V4-Pro", id: "ttsw-cc-balanced[1M]" } })).toBe("ttsw-cc-balanced[1M]");
  });

  it("does not duplicate an id already used as the display name", () => {
    expect(getModelId({ model: { display_name: "claude-opus-4-6", id: "claude-opus-4-6" } })).toBeNull();
  });
});
