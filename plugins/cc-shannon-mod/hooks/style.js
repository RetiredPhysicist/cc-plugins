/**
 * The visual language, shared with cc-shannon-statusline.
 *
 * Same Monokai mapping and the same icons, so the mod reads as the same product
 * as the statusline. Pure values only — no mods API here.
 */

export const ICON = {
  model: "λ",
  path: "⌘",
  branch: "⎇",
  clock: "✦",
  lock: "⊟",
  input: "↑",
  output: "↓",
  cache: "⊗",
  context: "⊡",
  speed: "»",
  rules: "≡",
  mcp: "⊕",
  warn: "▲",
  done: "✔",
  running: "↻",
  todo: "▸",
  claudeMd: "※",
  hook: "↩",
  skill: "★",
};

/**
 * Theme keys, not raw ANSI.
 *
 * The statusline writes escape codes directly because it owns stdout. A mod
 * hands colors to the host, which maps them per surface, so this is the mod
 * equivalent of the same palette.
 */
export const COLOR = {
  primary: "default",
  muted: "gray",
  accent: "magenta",
  brand: "magenta",
  cool: "cyan",
  positive: "green",
  warm: "yellow",
  danger: "red",
  neutral: "blue",
};

export const SEPARATOR = "│";

const RAIN_CHARS = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿ0123456789λΨΩΔΦ";

/** How many character columns the rain falls in, matching the statusline. */
export const RAIN_COLS = 6;

/** How many cells the rain strip takes, including one gap between columns. */
export const RAIN_WIDTH = RAIN_COLS + (RAIN_COLS - 1);

const RAIN_SPEED_MS = 900;
const RAIN_COL_OFFSET_MS = 280;

/**
 * One rain cell for a given row, cycling over the same characters and speed the
 * statusline uses.
 */
export function rainCell(row, now, totalRows, column = 0) {
  const rows = Math.max(1, totalRows);
  const phase = ((now + column * RAIN_COL_OFFSET_MS) / RAIN_SPEED_MS) % rows;
  const headRow = Math.floor(phase);
  const distance = (row - headRow + rows) % rows;

  const index = Math.floor(now / 350 + row * 7 + column * 13) % RAIN_CHARS.length;
  const char = RAIN_CHARS[index] ?? " ";

  // The head is bright, the trail fades, and the tail disappears.
  if (distance === 0) return { char, color: "green" };
  if (distance === 1) return { char, color: "green" };
  if (distance <= 2) return { char, color: "green" };
  if (distance <= 4) return { char, color: "gray" };
  return { char, color: "gray" };
}
