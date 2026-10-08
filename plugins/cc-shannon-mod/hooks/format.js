/**
 * Pure formatting and metric math.
 *
 * Nothing here touches the mods API, so it is unit-testable on its own and can
 * be called from any hook.
 */

/**
 * Compact token count, spelled exactly as the statusline spells it:
 * 1000 -> "1.0k", 1234 -> "1.2k", 1234567 -> "1.2M".
 *
 * The one decimal is kept even when it is zero, so a row does not change width
 * between 20.0k and 19.5k the way a trimmed form would.
 */
export function fmtTokens(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return (value / 1000).toFixed(1) + "k";
  return (value / 1_000_000).toFixed(1) + "M";
}

function trimZero(value) {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/**
 * Duration in milliseconds, spelled as the statusline spells it:
 * 1500 -> "2s", 95000 -> "1m 35s", 720000 -> "12m 0s".
 */
export function fmtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "0s";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(0)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${rest}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Token rate. Returns null when the inputs cannot produce a meaningful rate. */
export function tokensPerSecond(tokens, durationMs) {
  const count = Number(tokens);
  const ms = Number(durationMs);
  if (!Number.isFinite(count) || !Number.isFinite(ms) || count <= 0 || ms <= 0) return null;
  return count / (ms / 1000);
}

/** One decimal place, for rates and ratios. */
export function fmtRate(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number >= 100 ? String(Math.round(number)) : trimZero(number);
}

/**
 * A latency, spelled as the statusline's throughput row spells it:
 * 840 -> "840ms", 1240 -> "1.24s".
 */
export function fmtLatency(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "0ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

/**
 * The session clock, spelled as the statusline's project row spells it:
 * 30s -> "<1m", 12m -> "12m", 1h05 -> "1h 5m".
 */
export function fmtSessionDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "";
  const mins = Math.floor(value / 60000);
  if (mins < 1) return "<1m";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

/**
 * Build a text bar. `width` is the number of cells, and the fill is rounded so
 * a non-zero percentage always shows at least one cell.
 */
export function bar(percent, width) {
  const cells = Math.max(1, Math.floor(width));
  const clamped = Math.min(100, Math.max(0, Number(percent) || 0));
  const filled = clamped > 0 ? Math.max(1, Math.round((clamped / 100) * cells)) : 0;
  return "█".repeat(filled) + "░".repeat(cells - filled);
}

/** A severity bucket for a context-window percentage. */
export function contextLevel(percent) {
  const value = Number(percent) || 0;
  if (value >= 90) return "critical";
  if (value >= 75) return "warning";
  if (value >= 50) return "notice";
  return "ok";
}

/** Roll a list of numbers into min / max / average, ignoring the rest. */
export function summarize(values) {
  const numbers = values.filter((value) => Number.isFinite(value));
  if (numbers.length === 0) return null;
  const sum = numbers.reduce((total, value) => total + value, 0);
  return {
    count: numbers.length,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    average: sum / numbers.length,
  };
}
