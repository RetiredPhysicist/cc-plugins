/**
 * A small companion that grows as real work lands.
 *
 * Inspired by the arcade mods that keep a pet above the prompt, but fed by
 * things this mod already sees: a passing test run and a commit. Pure
 * functions and plain data, so the whole thing is unit-testable.
 */

export const COMPANION_KEY = "companion.v1";

/** What feeds it, and how much each kind is worth. */
export const KIND = {
  test: { xp: 1, icon: "✔" },
  commit: { xp: 3, icon: "⎇" },
};

/** Commands worth watching. Kept narrow so an idle shell does not feed it. */
const TEST_RUN =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\bpytest\b|\bgo\s+test\b|\bcargo\s+test\b|\bvitest\b|\bjest\b|\bmake\s+test\b/;
const COMMIT = /\bgit\s+commit\b/;

/** Which kind of food a command is, or null when it is neither. */
export function classify(command) {
  const text = String(command ?? "");
  if (!text.trim()) return null;
  if (COMMIT.test(text)) return "commit";
  if (TEST_RUN.test(text)) return "test";
  return null;
}

export function emptyCompanion() {
  return { xp: 0, tests: 0, commits: 0, lastFedAt: 0 };
}

/** Normalize whatever came out of the store; bad data degrades to a fresh pet. */
export function normalizeCompanion(value) {
  if (!value || typeof value !== "object") return emptyCompanion();
  return {
    xp: positive(value.xp),
    tests: positive(value.tests),
    commits: positive(value.commits),
    // A timestamp is not a count: a stored value can legitimately be any
    // number, and clamping negatives to zero would hide "fed long ago".
    lastFedAt: finite(value.lastFedAt),
  };
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Feed it once. An unsuccessful command is not food: a failing test suite
 * should not grow the pet, or it would reward red builds.
 */
export function feed(companion, kind, { succeeded = true, now = Date.now() } = {}) {
  const base = normalizeCompanion(companion);
  if (!kind || !succeeded || !(kind in KIND)) return base;

  const gained = KIND[kind].xp;
  return {
    xp: base.xp + gained,
    tests: base.tests + (kind === "test" ? 1 : 0),
    commits: base.commits + (kind === "commit" ? 1 : 0),
    lastFedAt: now,
  };
}

/** Every five experience is a level, counting from one. */
export function level(companion) {
  return 1 + Math.floor(normalizeCompanion(companion).xp / 5);
}

const IDLE_MS = 30 * 60 * 1000;
const RECENT_MS = 60 * 1000;

/**
 * The face, which says how it is doing without a word of text.
 *
 * Three states carry the whole story: just fed, awake, and idle for a while.
 */
export function face(companion, now = Date.now()) {
  const pet = normalizeCompanion(companion);
  const lv = level(pet);

  if (lv < 2) return "( · )";
  if (pet.lastFedAt && now - pet.lastFedAt < RECENT_MS) return lv >= 5 ? "(^‿^)" : "(•‿•)";
  if (pet.lastFedAt && now - pet.lastFedAt > IDLE_MS) return "(-.-)";
  if (lv >= 5) return "(•‿•)";
  if (lv >= 3) return "(•_•)";
  return "(·_·)";
}

/** One compact line: face, level, and what it has eaten. */
export function describe(companion, now = Date.now()) {
  const pet = normalizeCompanion(companion);
  const parts = [`${face(pet, now)} Lv${level(pet)}`];
  if (pet.tests > 0) parts.push(`${KIND.test.icon}${pet.tests}`);
  if (pet.commits > 0) parts.push(`${KIND.commit.icon}${pet.commits}`);
  return parts.join(" ");
}
