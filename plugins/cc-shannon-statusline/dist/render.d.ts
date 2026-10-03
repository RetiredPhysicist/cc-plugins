import { type StatuslineConfig } from "./config.js";
import type { ConfigCounts, GitStatus, StdinData, TranscriptData } from "./types.js";
export declare function contextBar(percent: number, width: number): string;
export declare function contextPercentColor(percent: number): string;
export declare function fmtTokens(n: number): string;
export declare function fmtDurationShort(ms: number): string;
export declare function rainVisibleWidth(): number;
export declare function makeRainRow(row: number, now: number, totalRows: number): string;
type SepState = "idle" | "waiting" | "done";
export declare function detectSepState(stdin: StdinData, transcript: TranscriptData): SepState;
export declare function makeSeparator(state: SepState, width: number): string;
export declare function render(stdin: StdinData, transcript: TranscriptData, git: GitStatus | null, configCounts: ConfigCounts, sessionDuration: string, config?: StatuslineConfig): void;
export {};
//# sourceMappingURL=render.d.ts.map