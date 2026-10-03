/**
 * Context growth, and how many turns are left before compaction.
 *
 * A single percentage says how full the window is; the rate says whether that
 * matters yet. Both come from the usage figures the session already reports.
 */

const MAX_SAMPLES = 12;

export function createLens() {
  return [];
}

/** Record a reading. Repeats of the same value add nothing. */
export function sample(samples, percent) {
  const value = Number(percent);
  if (!Number.isFinite(value) || value < 0) return samples.slice();
  const list = Array.isArray(samples) ? samples.slice() : [];
  if (list.length && list[list.length - 1] === value) return list;
  list.push(value);
  return list.slice(-MAX_SAMPLES);
}

/**
 * Average growth per turn.
 *
 * Measured only over increases: context also drops when it is compacted, and
 * averaging those in would understate the climb and overstate the runway.
 */
export function growthPerTurn(samples) {
  const list = Array.isArray(samples) ? samples : [];
  if (list.length < 2) return null;

  const rises = [];
  for (let i = 1; i < list.length; i += 1) {
    const delta = list[i] - list[i - 1];
    if (delta > 0) rises.push(delta);
  }
  if (!rises.length) return null;
  return rises.reduce((sum, value) => sum + value, 0) / rises.length;
}

/**
 * Turns left before the window fills, or null when the growth is flat.
 *
 * This is an estimate from recent history, not a prediction: it says what
 * happens if the next turns look like the last few.
 */
export function turnsLeft(samples, current, { ceiling = 95 } = {}) {
  const growth = growthPerTurn(samples);
  const value = Number(current);
  if (growth === null || growth <= 0 || !Number.isFinite(value)) return null;
  if (value >= ceiling) return 0;
  return Math.max(0, Math.floor((ceiling - value) / growth));
}

/** One compact line, or empty when growth is flat or unknown. */
export function describe(samples, current) {
  const growth = growthPerTurn(samples);
  if (growth === null) return "";
  const left = turnsLeft(samples, current);
  const parts = [`+${growth.toFixed(1)}%/turn`];
  if (left !== null) parts.push(left === 0 ? "compacting soon" : `~${left} turns left`);
  return parts.join(" · ");
}
