#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { writeBridge } from "./bridge.js";
import { countConfigs } from "./config-counter.js";
import { loadConfig } from "./config.js";
import { getGitStatus } from "./git.js";
import { renderPowerline } from "./render-powerline.js";
import { render } from "./render.js";
import { readStdin } from "./stdin.js";
import { parseTranscript } from "./transcript.js";
function parseArgs() {
    const args = process.argv.slice(2);
    let style = "cyberpunk";
    let nerdFont = true;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--style" && args[i + 1]) {
            style = args[i + 1];
            i++;
        }
        else if (args[i] === "--no-nerd-font") {
            nerdFont = false;
        }
    }
    return { style, nerdFont };
}
export async function main() {
    try {
        const { style, nerdFont } = parseArgs();
        const stdin = await readStdin();
        if (!stdin) {
            // boot — no input yet (Claude Code sends empty Data on first tick)
            return;
        }
        const transcriptPath = stdin.transcript_path ?? "";
        const cwd = stdin.cwd ?? stdin.workspace?.current_dir ?? "";
        const config = loadConfig();
        // Collect data in parallel
        const [transcript, git, configCounts] = await Promise.all([
            parseTranscript(transcriptPath),
            getGitStatus(cwd),
            countConfigs(cwd),
        ]);
        // Session duration
        const sessionDuration = formatSessionDuration(transcript.sessionStart);
        if (style === "powerline") {
            renderPowerline(stdin, transcript, git, configCounts, sessionDuration, {
                nerdFont,
                throughput: config.throughput,
            });
        }
        else {
            render(stdin, transcript, git, configCounts, sessionDuration, config);
        }
        // Write bridge file for Shannon GUI
        const bridgeData = assembleBridgeData(stdin, transcript, git, configCounts);
        writeBridge(bridgeData);
    }
    catch (error) {
        console.log("[cc-shannon-statusline] Error:", error instanceof Error ? error.message : "Unknown error");
    }
}
function assembleBridgeData(stdin, transcript, git, configCounts) {
    const usage = stdin.context_window?.current_usage;
    return {
        session_id: stdin.session_id ?? null,
        transcript_path: stdin.transcript_path ?? null,
        version: stdin.version ?? null,
        output_style: stdin.output_style?.name ?? null,
        exceeds_200k_tokens: stdin.exceeds_200k_tokens ?? false,
        model: stdin.model?.id
            ? {
                id: stdin.model.id,
                display_name: stdin.model.display_name ?? stdin.model.id,
            }
            : null,
        context_window: stdin.context_window
            ? {
                used_percentage: stdin.context_window.used_percentage ?? 0,
                remaining_percentage: stdin.context_window.remaining_percentage ?? 100,
                context_window_size: stdin.context_window.context_window_size ?? 0,
                input_tokens: usage?.input_tokens ?? 0,
                output_tokens: usage?.output_tokens ?? 0,
                cache_creation_input_tokens: usage?.cache_creation_input_tokens ?? 0,
                cache_read_input_tokens: usage?.cache_read_input_tokens ?? 0,
            }
            : null,
        cost: stdin.cost
            ? {
                total_cost_usd: stdin.cost.total_cost_usd ?? 0,
                total_duration_ms: stdin.cost.total_duration_ms ?? 0,
                total_api_duration_ms: stdin.cost.total_api_duration_ms ?? 0,
                total_lines_added: stdin.cost.total_lines_added ?? 0,
                total_lines_removed: stdin.cost.total_lines_removed ?? 0,
            }
            : null,
        workspace: stdin.cwd
            ? {
                cwd: stdin.cwd,
                project_dir: stdin.workspace?.project_dir ?? null,
                added_dirs: stdin.workspace?.added_dirs ?? [],
            }
            : null,
        git: git
            ? {
                branch: git.branch,
                is_dirty: git.isDirty,
                ahead: git.ahead,
                behind: git.behind,
                file_stats: git.fileStats,
            }
            : null,
        tools: transcript.tools.map((t) => ({
            name: t.name,
            target: t.target,
            status: t.status,
            start_time_ms: t.startTime.getTime(),
            duration_ms: t.endTime
                ? t.endTime.getTime() - t.startTime.getTime()
                : null,
        })),
        tool_counts: transcript.toolCounts,
        agents: transcript.agents.map((a) => ({
            id: a.id,
            type: a.type,
            model: a.model,
            description: a.description,
            status: a.status,
            start_time_ms: a.startTime.getTime(),
            duration_ms: a.endTime
                ? a.endTime.getTime() - a.startTime.getTime()
                : null,
        })),
        todos: transcript.todos,
        file_activity: transcript.fileActivity,
        config_counts: {
            claude_md: configCounts.claudeMd,
            rules: configCounts.rules,
            mcp: configCounts.mcp,
            hooks: configCounts.hooks,
            skills: configCounts.skills,
        },
        session_duration_ms: transcript.sessionStart
            ? Date.now() - transcript.sessionStart.getTime()
            : null,
        vim_mode: stdin.vim?.mode ?? null,
        agent_name: stdin.agent?.name ?? null,
        permission_mode: stdin.permission_mode ?? null,
        timestamp: Date.now(),
    };
}
function formatSessionDuration(sessionStart) {
    if (!sessionStart)
        return "";
    const ms = Date.now() - sessionStart.getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1)
        return "<1m";
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
}
// Direct execution detection
const scriptPath = fileURLToPath(import.meta.url);
const argvPath = process.argv[1];
const isSamePath = (a, b) => {
    try {
        return realpathSync(a) === realpathSync(b);
    }
    catch {
        return a === b;
    }
};
if (argvPath && isSamePath(argvPath, scriptPath)) {
    void main();
}
//# sourceMappingURL=index.js.map