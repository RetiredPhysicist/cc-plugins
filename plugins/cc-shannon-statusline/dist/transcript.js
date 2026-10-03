import * as fs from "node:fs";
import * as readline from "node:readline";
const MAX_TOOLS = 20;
const MAX_AGENTS = 10;
const MAX_FILES = 20;
export async function parseTranscript(transcriptPath) {
    const result = {
        tools: [],
        toolCounts: {},
        agents: [],
        todos: [],
        fileActivity: [],
        sessionStart: null,
        throughput: null,
    };
    if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        return result;
    }
    const toolMap = new Map();
    const agentMap = new Map();
    const toolCountMap = new Map();
    const fileSet = new Set();
    const latestTodos = [];
    const assistantMap = new Map();
    let previousMessageTimestamp = null;
    try {
        const fileStream = fs.createReadStream(transcriptPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity,
        });
        for await (const line of rl) {
            if (!line.trim())
                continue;
            try {
                const entry = JSON.parse(line);
                const timestamp = getEntryTimestamp(entry);
                processEntry(entry, toolMap, agentMap, toolCountMap, fileSet, latestTodos, result, assistantMap, previousMessageTimestamp);
                if (timestamp && isConversationMessage(entry))
                    previousMessageTimestamp = timestamp;
            }
            catch {
                // Skip malformed lines
            }
        }
    }
    catch {
        // Return partial results on error
    }
    result.tools = Array.from(toolMap.values()).slice(-MAX_TOOLS);
    result.toolCounts = Object.fromEntries(toolCountMap);
    result.agents = Array.from(agentMap.values()).slice(-MAX_AGENTS);
    result.todos = latestTodos;
    result.fileActivity = Array.from(fileSet).slice(-MAX_FILES);
    result.throughput = summarizeThroughput(assistantMap);
    return result;
}
function processEntry(entry, toolMap, agentMap, toolCountMap, fileSet, latestTodos, result, assistantMap, previousMessageTimestamp) {
    const parsedTimestamp = getEntryTimestamp(entry);
    const timestamp = parsedTimestamp ?? new Date();
    if (!result.sessionStart && parsedTimestamp) {
        result.sessionStart = timestamp;
    }
    const message = entry.message;
    recordAssistantMessage(message, parsedTimestamp, previousMessageTimestamp, assistantMap);
    const content = message?.content;
    if (!content || !Array.isArray(content))
        return;
    for (const block of content) {
        if (block.type === "tool_use" && block.id && block.name) {
            const toolName = block.name;
            const input = block.input;
            // Count all tool uses
            toolCountMap.set(toolName, (toolCountMap.get(toolName) ?? 0) + 1);
            // Track file activity from Read/Write/Edit
            const filePath = extractFilePath(toolName, input);
            if (filePath) {
                fileSet.add(filePath);
            }
            if (toolName === "Agent" || toolName === "Task") {
                // Sub-agent
                const agentEntry = {
                    id: block.id,
                    type: input?.subagent_type ?? "unknown",
                    model: input?.model ?? null,
                    description: input?.description ?? null,
                    status: "running",
                    startTime: timestamp,
                };
                agentMap.set(block.id, agentEntry);
            }
            else if (toolName === "TodoWrite") {
                // Todos
                const todos = input?.todos;
                if (todos && Array.isArray(todos)) {
                    latestTodos.length = 0;
                    latestTodos.push(...todos.map((t) => ({
                        content: t.content ?? t.subject ?? "",
                        status: t.status ?? "pending",
                    })));
                }
            }
            else {
                // Regular tool
                const toolEntry = {
                    id: block.id,
                    name: toolName,
                    target: extractTarget(toolName, input),
                    status: "running",
                    startTime: timestamp,
                };
                toolMap.set(block.id, toolEntry);
            }
        }
        if (block.type === "tool_result" && block.tool_use_id) {
            const id = block.tool_use_id;
            const tool = toolMap.get(id);
            if (tool) {
                tool.status = block.is_error ? "error" : "completed";
                tool.endTime = timestamp;
            }
            const agent = agentMap.get(id);
            if (agent) {
                agent.status = "completed";
                agent.endTime = timestamp;
            }
        }
    }
}
function getEntryTimestamp(entry) {
    if (typeof entry.timestamp !== "string" && typeof entry.timestamp !== "number")
        return null;
    const timestamp = new Date(entry.timestamp);
    return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}
function isConversationMessage(entry) {
    const message = entry.message;
    return message?.role === "user" || message?.role === "assistant";
}
function recordAssistantMessage(message, timestamp, previousMessageTimestamp, assistantMap) {
    if (!message || message.role !== "assistant" || typeof message.id !== "string" || !timestamp)
        return;
    const usage = message.usage;
    const outputTokens = typeof usage?.output_tokens === "number" ? usage.output_tokens : null;
    const current = assistantMap.get(message.id);
    if (current) {
        current.lastTokenAt = timestamp;
        if (outputTokens !== null)
            current.outputTokens = outputTokens;
        return;
    }
    assistantMap.set(message.id, {
        requestStartedAt: previousMessageTimestamp,
        firstTokenAt: timestamp,
        lastTokenAt: timestamp,
        outputTokens: outputTokens ?? 0,
    });
}
function summarizeThroughput(assistantMap) {
    const latest = Array.from(assistantMap.values()).reduce((current, candidate) => {
        if (!current || candidate.lastTokenAt > current.lastTokenAt)
            return candidate;
        return current;
    }, null);
    if (!latest)
        return null;
    const ttftMs = latest.requestStartedAt
        ? Math.max(0, latest.firstTokenAt.getTime() - latest.requestStartedAt.getTime())
        : null;
    const responseDurationMs = Math.max(0, latest.lastTokenAt.getTime() - latest.firstTokenAt.getTime());
    const tokensPerSecond = responseDurationMs > 0 && latest.outputTokens > 0
        ? latest.outputTokens / (responseDurationMs / 1000)
        : null;
    return {
        ttftMs,
        responseDurationMs,
        outputTokens: latest.outputTokens,
        tokensPerSecond,
    };
}
function extractFilePath(toolName, input) {
    if (!input)
        return null;
    if (toolName === "Read" || toolName === "Write" || toolName === "Edit") {
        return input.file_path ?? input.path ?? null;
    }
    return null;
}
function extractTarget(toolName, input) {
    if (!input)
        return null;
    switch (toolName) {
        case "Read":
        case "Write":
        case "Edit":
            return input.file_path ?? input.path ?? null;
        case "Glob":
        case "Grep":
            return input.pattern ?? null;
        case "Bash": {
            const cmd = input.command;
            if (!cmd)
                return null;
            return cmd.length > 40 ? `${cmd.slice(0, 40)}...` : cmd;
        }
        case "WebFetch":
            return input.url ?? null;
        case "WebSearch":
            return input.query ?? null;
        case "LSP":
            return input.operation ?? null;
    }
    return null;
}
//# sourceMappingURL=transcript.js.map