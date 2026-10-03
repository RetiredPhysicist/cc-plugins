/**
 * Pure formatting and metric math.
 *
 * Nothing here touches the mods API, so it is unit-testable on its own and can
 * be called from any hook.
 */

/** Compact token count: 1234 -> "1.2k", 1234567 -> "1.2M". */
export function fmtTokens(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) return trimZero(value / 1000) + "k";
  return trimZero(value / 1_000_000) + "M";
}

function trimZero(value) {
  const fixed = value.toFixed(1);
  return fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
}

/** Duration in milliseconds as a short human string. */
export function fmtDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value < 0) return "0s";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${trimZero(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest ? `${minutes}m${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${minutes % 60}m`;
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
