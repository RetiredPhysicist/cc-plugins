/**
 * What to say in a native notification, and when.
 *
 * Claude Code 2.1.295 added `$.ui.notify(text)`, which raises a notification
 * through the person's own notification setting. It matters most to this plugin
 * in the case the pane cannot cover: several agents running in the background,
 * where a blocked command sits unread until someone looks.
 *
 * The rules live here, away from the mods API, so they are testable on their
 * own. Pure values only.
 */

/** Whether the person wants native notifications at all. */
export function shouldNotify(config) {
  return config?.notify === true;
}

/** One line, trimmed and bounded, so a long command cannot flood the banner. */
function oneLine(text, limit = 160) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1)}…`;
}

/**
 * The notification for a command the guard stopped.
 *
 * The text names the command, because a banner that only says "a command was
 * blocked" sends the person back to the terminal to find out which one.
 *
 * It does not claim the command is waiting, because this is raised as the guard
 * engages: the person may still be at the prompt, and a `-p` run refuses at
 * once. Saying what is being guarded is true in both cases; saying which of the
 * two is happening would be a guess.
 */
export function guardNotice({ reason, command }) {
  const why = oneLine(reason, 80);
  const what = oneLine(command, 100);
  return `cc-shannon guard: ${why} — ${what}`;
}
