export function formatLatency(ms) {
    if (ms < 1000)
        return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}
export function formatThroughputParts(throughput) {
    if (!throughput || throughput.outputTokens <= 0)
        return null;
    const parts = [];
    if (throughput.ttftMs !== null)
        parts.push({ key: "TTFT", value: formatLatency(throughput.ttftMs) });
    if (throughput.tokensPerSecond !== null) {
        parts.push({
            key: "Decode",
            value: `~${throughput.tokensPerSecond.toFixed(1)} tok/s · ~${formatTokens(throughput.outputTokens)} tok`,
        });
    }
    else {
        parts.push({ key: "Decode", value: `~${formatTokens(throughput.outputTokens)} tok` });
    }
    return parts;
}
export function formatThroughputText(throughput) {
    const parts = formatThroughputParts(throughput);
    return parts?.map(({ key, value }) => `${key} ${value}`).join(" · ") ?? null;
}
function formatTokens(n) {
    if (n >= 1_000_000)
        return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000)
        return `${(n / 1000).toFixed(1)}k`;
    return `${n}`;
}
//# sourceMappingURL=throughput.js.map