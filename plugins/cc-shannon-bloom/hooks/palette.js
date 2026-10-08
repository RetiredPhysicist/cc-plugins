/**
 * The bloom palette and glyphs.
 *
 * Lifted from opencode-bloom (MIT, Kit Langton) so the live pane reads as the
 * same film: the same luminous hues, the same five tool colors, the same warm
 * kit-comet gold. Pure values only — no mods API here.
 */

export const RGB = {
  kit: [1.0, 0.95, 0.86],
  gold: [1.0, 0.8, 0.45],
  cool: [0.62, 0.8, 1.0],
  white: [1, 1, 1],
};

/** Luminous hues that read on near-black; ordered so neighbors contrast. */
export const PALETTE = [
  [0.48, 0.64, 1.0], // periwinkle
  [0.37, 0.92, 0.83], // teal
  [0.98, 0.66, 0.83], // pink
  [0.99, 0.83, 0.42], // amber
  [0.66, 0.55, 0.98], // violet
  [0.53, 0.94, 0.67], // mint
  [0.99, 0.73, 0.45], // peach
  [0.4, 0.91, 0.98], // cyan
  [0.97, 0.5, 0.48], // coral
  [0.8, 0.76, 1.0], // lavender
  [0.75, 0.95, 0.45], // lime
];

/** read, edit, shell, web, delegate: distinct but in the same pastel key. */
export const TOOL_COLORS = [
  [0.6, 0.85, 1.0],
  [1.0, 0.8, 0.5],
  [0.55, 1.0, 0.78],
  [0.78, 0.66, 1.0],
  [1.0, 0.64, 0.8],
];

export const TOOL_KINDS = [
  ["read", "grep", "glob", "ls", "notebookread"],
  ["edit", "write", "multiedit", "notebookedit", "patch"],
  ["bash", "shell", "execute", "task"],
  ["websearch", "webfetch"],
  ["agent", "task", "skill", "workflow"],
];

/** Which of the five kinds a tool name is; delegate is the fallback. */
export function toolKind(name) {
  const key = String(name ?? "").toLowerCase();
  for (let index = 0; index < TOOL_KINDS.length; index += 1) {
    if (TOOL_KINDS[index].includes(key)) return index;
  }
  return 4;
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

/** One 0xRRGGBB integer from a bloom RGB triple, dimmed by `alpha`. */
export function packed(rgb, alpha = 1) {
  const a = clamp(alpha, 0, 1);
  const r = Math.round(clamp(rgb[0] * a, 0, 1) * 255);
  const g = Math.round(clamp(rgb[1] * a, 0, 1) * 255);
  const b = Math.round(clamp(rgb[2] * a, 0, 1) * 255);
  return (r << 16) | (g << 8) | b;
}

/**
 * The sky keyframes from bloom: night, indigo pre-dawn, warm dawn, a cool dark
 * day, amber dusk, then night again. The pane paints the raster's background
 * with the top color so the map sits on the same sky the film does.
 */
const NIGHT = { top: [0.005, 0.006, 0.013], glow: [0, 0, 0] };
const DAY = { top: [0.016, 0.04, 0.084], glow: [0.008, 0.02, 0.03] };
const SKY_KEYS = [
  { h: 0, ...NIGHT },
  { h: 4.2, ...NIGHT },
  { h: 5.4, top: [0.012, 0.011, 0.045], glow: [0.03, 0.012, 0.05] },
  { h: 6.7, top: [0.022, 0.028, 0.07], glow: [0.26, 0.11, 0.05] },
  { h: 8.2, top: [0.02, 0.042, 0.088], glow: [0.03, 0.028, 0.02] },
  { h: 10, ...DAY },
  { h: 17.8, ...DAY },
  { h: 19.2, top: [0.03, 0.03, 0.068], glow: [0.18, 0.085, 0.02] },
  { h: 20.5, top: [0.012, 0.011, 0.034], glow: [0.025, 0.01, 0.012] },
  { h: 21.6, ...NIGHT },
  { h: 24, ...NIGHT },
];

/** The sky's top color at a fractional local hour, blended between keyframes. */
export function skyAt(hourOfDay) {
  const h = ((Number(hourOfDay) || 0) % 24 + 24) % 24;
  for (let i = 0; i < SKY_KEYS.length - 1; i += 1) {
    const a = SKY_KEYS[i];
    const b = SKY_KEYS[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = b.h === a.h ? 0 : (h - a.h) / (b.h - a.h);
      return mix(a.top, b.top, t);
    }
  }
  return NIGHT.top;
}
