import type { ShannonBridgeData } from "./types.js";
/**
 * Send bridge data via Unix socket (NDJSON protocol).
 *
 * Message format:
 * { "type": "status_update", "session_id": "...", ...data }
 */
export declare function writeBridge(data: ShannonBridgeData): void;
//# sourceMappingURL=bridge.d.ts.map