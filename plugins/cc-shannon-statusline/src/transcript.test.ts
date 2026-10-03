import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseTranscript } from "./transcript.js";

function makeTranscript(lines: unknown[]): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "cc-shannon-statusline-transcript-"));
  const path = join(dir, "session.jsonl");
  writeFileSync(path, lines.map((line) => JSON.stringify(line)).join("\n"));
  return { dir, path };
}

describe("parseTranscript throughput", () => {
  it("summarizes the latest assistant stream", async () => {
    const { dir, path } = makeTranscript([
      { timestamp: "2026-09-13T10:00:00.000Z", message: { role: "user", content: "hello" } },
      {
        timestamp: "2026-09-13T10:00:00.100Z",
        message: {
          role: "assistant",
          id: "assistant-1",
          content: [{ type: "thinking", thinking: "..." }],
          usage: { output_tokens: 40 },
        },
      },
      {
        timestamp: "2026-09-13T10:00:00.500Z",
        message: {
          role: "assistant",
          id: "assistant-1",
          content: [{ type: "text", text: "done" }],
          usage: { output_tokens: 100 },
          stop_reason: "end_turn",
        },
      },
    ]);

    const transcript = await parseTranscript(path);
    expect(transcript.throughput).toEqual({
      ttftMs: 100,
      responseDurationMs: 400,
      outputTokens: 100,
      tokensPerSecond: 250,
    });
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns no throughput for a missing transcript", async () => {
    const transcript = await parseTranscript("/tmp/does-not-exist-cc-shannon-statusline.jsonl");
    expect(transcript.throughput).toBeNull();
  });
});
