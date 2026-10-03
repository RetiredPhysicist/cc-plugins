export async function readStdin() {
    // Note: process.stdin.isTTY check intentionally removed.
    // When Claude Code invokes the statusline plugin via PTY subprocess,
    // stdin.isTTY is true but data IS available via pipe. The empty-input
    // guard below handles the genuinely-empty case correctly.
    const chunks = [];
    try {
        process.stdin.setEncoding("utf8");
        for await (const chunk of process.stdin) {
            chunks.push(chunk);
        }
        const raw = chunks.join("");
        if (!raw.trim()) {
            return null;
        }
        return JSON.parse(raw);
    }
    catch {
        return null;
    }
}
export function getModelName(stdin) {
    return stdin.model?.display_name?.trim() || stdin.model?.id?.trim() || "Unknown";
}
export function getModelId(stdin) {
    const id = stdin.model?.id?.trim();
    const displayName = stdin.model?.display_name?.trim();
    if (!id || !displayName || id === displayName)
        return null;
    return id;
}
export function getContextPercent(stdin) {
    const native = stdin.context_window?.used_percentage;
    if (typeof native === "number" && !Number.isNaN(native)) {
        return Math.min(100, Math.max(0, Math.round(native)));
    }
    const size = stdin.context_window?.context_window_size;
    if (!size || size <= 0)
        return 0;
    const usage = stdin.context_window?.current_usage;
    const totalTokens = (usage?.input_tokens ?? 0) +
        (usage?.cache_creation_input_tokens ?? 0) +
        (usage?.cache_read_input_tokens ?? 0);
    return Math.min(100, Math.round((totalTokens / size) * 100));
}
//# sourceMappingURL=stdin.js.map