import type { StdinData } from "./types.js";
export declare function readStdin(): Promise<StdinData | null>;
export declare function getModelName(stdin: StdinData): string;
export declare function getModelId(stdin: StdinData): string | null;
export declare function getContextPercent(stdin: StdinData): number;
//# sourceMappingURL=stdin.d.ts.map