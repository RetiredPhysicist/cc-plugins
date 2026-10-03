const RESET = "\x1b[0m";

function rgb(r: number, g: number, b: number): string {
  return `\x1b[38;2;${r};${g};${b}m`;
}

function bgRgb(r: number, g: number, b: number): string {
  return `\x1b[48;2;${r};${g};${b}m`;
}

// ── Sparkline ──────────────────────────────────────────────

const SPARK_CHARS = "▁▂▃▄▅▆▇█";

export function sparkline(values: number[], width: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;

  const sampled = resample(values, width);
  return sampled
    .map((v) => {
      const normalized = (v - min) / range;
      const idx = Math.min(Math.floor(normalized * SPARK_CHARS.length), SPARK_CHARS.length - 1);
      return SPARK_CHARS[idx];
    })
    .join("");
}

function resample(data: number[], targetLen: number): number[] {
  if (data.length === targetLen) return data;
  if (data.length === 0) return Array(targetLen).fill(0);
  const result: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    const pos = (i / targetLen) * data.length;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, data.length - 1);
    const frac = pos - lo;
    result.push(data[lo] * (1 - frac) + data[hi] * frac);
  }
  return result;
}

// ── Gradient text ──────────────────────────────────────────

export function gradientText(
  text: string,
  colors: Array<[number, number, number]>,
): string {
  if (colors.length === 0) return text;
  if (colors.length === 1) {
    const [r, g, b] = colors[0];
    return `${rgb(r, g, b)}${text}${RESET}`;
  }
  const chars = [...text];
  return chars
    .map((ch, i) => {
      const t = chars.length > 1 ? i / (chars.length - 1) : 1;
      const segIdx = Math.min(Math.floor(t * (colors.length - 1)), colors.length - 2);
      const segT = t * (colors.length - 1) - segIdx;
      const [r0, g0, b0] = colors[segIdx];
      const [r1, g1, b1] = colors[segIdx + 1];
      const r = Math.round(r0 + (r1 - r0) * segT);
      const g = Math.round(g0 + (g1 - g0) * segT);
      const b = Math.round(b0 + (b1 - b0) * segT);
      return `${rgb(r, g, b)}${ch}`;
    })
    .join("");
}

// ── Box drawing ────────────────────────────────────────────

export function boxTop(width: number): string {
  return `╭${"─".repeat(width - 2)}╮`;
}

export function boxBottom(width: number): string {
  return `╰${"─".repeat(width - 2)}╯`;
}

export function boxRow(text: string, width: number): string {
  const inner = width - 4; // │ + space + ... + space + │
  const visible = stripAnsi(text).length;
  const pad = Math.max(0, inner - visible);
  return `│ ${text}${" ".repeat(pad)} │`;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Badge / Pill ───────────────────────────────────────────

export function badge(
  text: string,
  fg: string,
  bg: [number, number, number],
): string {
  return `${bgRgb(bg[0], bg[1], bg[2])}${fg} ${text} ${RESET}`;
}

// ── Code change ratio bar ──────────────────────────────────

export function codeChangeBar(
  added: number,
  removed: number,
  width: number,
): string {
  const total = added + removed;
  if (total === 0) return "";
  const addedWidth = Math.round((added / total) * width);
  const removedWidth = width - addedWidth;
  const green = "\x1b[48;2;40;160;40m";
  const red = "\x1b[48;2;160;40;40m";
  return `${green}${" ".repeat(addedWidth)}${RESET}${red}${" ".repeat(removedWidth)}${RESET}`;
}
