/**
 * A stack of prompts to send when the current turn ends.
 *
 * Claude Code's own composer takes one prompt at a time, and a mod is the only
 * thing that knows when the session goes idle. Pure functions here; the sending
 * happens at the call site.
 */

const MAX_ITEMS = 20;
const MAX_LENGTH = 2000;

export function emptyQueue() {
  return [];
}

/**
 * Add one prompt. Returns the new queue, or null when the text is unusable —
 * so the caller can say why instead of silently dropping it.
 */
export function enqueue(queue, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  const items = Array.isArray(queue) ? queue.slice() : [];
  if (items.length >= MAX_ITEMS) return null;
  items.push(trimmed.slice(0, MAX_LENGTH));
  return items;
}

/** Take the next prompt, and the queue without it. */
export function dequeue(queue) {
  const items = Array.isArray(queue) ? queue.slice() : [];
  if (!items.length) return { text: null, queue: items };
  const [text, ...rest] = items;
  return { text, queue: rest };
}

/** Drop the item at `index`; a bad index leaves the queue alone. */
export function removeAt(queue, index) {
  const items = Array.isArray(queue) ? queue.slice() : [];
  if (!Number.isInteger(index) || index < 0 || index >= items.length) return items;
  items.splice(index, 1);
  return items;
}

/** Move one item up or down, which is what makes the stack reorderable. */
export function move(queue, index, direction) {
  const items = Array.isArray(queue) ? queue.slice() : [];
  const target = index + (direction === "up" ? -1 : 1);
  if (target < 0 || target >= items.length || index < 0 || index >= items.length) return items;
  [items[index], items[target]] = [items[target], items[index]];
  return items;
}

/** One compact line, or empty when there is nothing waiting. */
export function describe(queue, { preview = 48 } = {}) {
  const items = Array.isArray(queue) ? queue : [];
  if (!items.length) return "";
  const head = items[0].length > preview ? `${items[0].slice(0, preview - 1)}…` : items[0];
  const more = items.length > 1 ? ` (+${items.length - 1})` : "";
  return `▸ ${head}${more}`;
}
