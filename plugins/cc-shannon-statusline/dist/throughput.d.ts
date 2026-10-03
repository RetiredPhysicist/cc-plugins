import type { ResponseThroughput } from "./types.js";
export interface ThroughputPart {
    key: string;
    value: string;
}
export declare function formatLatency(ms: number): string;
export declare function formatThroughputParts(throughput: ResponseThroughput | null): ThroughputPart[] | null;
export declare function formatThroughputText(throughput: ResponseThroughput | null): string | null;
//# sourceMappingURL=throughput.d.ts.map