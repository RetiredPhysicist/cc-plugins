import * as fs from "node:fs";
import * as net from "node:net";
import type { ShannonBridgeData } from "./types.js";

/**
 * Resolve the Unix socket path: /tmp/shannon-<uid>.sock
 * Environment variable SHANNON_SOCKET_PATH overrides for testing.
 */
function getSocketPath(): string {
  if (process.env.SHANNON_SOCKET_PATH) {
    return process.env.SHANNON_SOCKET_PATH;
  }
  return `/tmp/shannon-${process.getuid?.() ?? 0}.sock`;
}

const SOCKET_PATH = getSocketPath();

/** Socket send timeout (ms) */
const SOCKET_TIMEOUT = 2000;

/**
 * Send bridge data via Unix socket (NDJSON protocol).
 *
 * Message format:
 * { "type": "status_update", "session_id": "...", ...data }
 */
export function writeBridge(data: ShannonBridgeData): void {
  const bridgeMessage = {
    type: "status_update",
    session_id: data.session_id ?? "unknown",
    model: data.model,
    context_window: data.context_window,
    cost: data.cost,
    tool_counts: data.tool_counts,
    tools: data.tools,
    agents: data.agents,
    todos: data.todos,
    file_activity: data.file_activity,
    config_counts: data.config_counts,
    git: data.git,
    workspace: data.workspace,
    session_duration_ms: data.session_duration_ms,
    vim_mode: data.vim_mode,
    agent_name: data.agent_name,
    permission_mode: data.permission_mode,
    version: data.version,
    timestamp: data.timestamp,
  };

  const ndjsonLine = `${JSON.stringify(bridgeMessage)}\n`;

  try {
    if (!fs.existsSync(SOCKET_PATH)) {
      return;
    }

    const socket = net.createConnection({ path: SOCKET_PATH });
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    }, SOCKET_TIMEOUT);

    socket.on("connect", () => {
      socket.write(ndjsonLine, () => {
        clearTimeout(timeout);
        resolved = true;
        socket.end();
      });
    });

    socket.on("error", () => {
      if (!resolved) {
        clearTimeout(timeout);
        resolved = true;
        socket.destroy();
      }
    });
  } catch {
    // Silently ignore send errors — Shannon app may not be running
  }
}
