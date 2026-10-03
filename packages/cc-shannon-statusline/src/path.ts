export interface ShortenDisplayPathOptions {
  homeDir?: string;
  keepTailSegments?: number;
  maxLength?: number;
}

function abbreviateSegment(segment: string): string {
  if (segment.length <= 1) return segment;
  const extra = segment.match(/[-.](.)/);
  return extra ? `${segment[0]}${extra[0]}` : segment[0];
}

function joinDisplayPath(prefix: "~" | "/" | "", segments: string[]): string {
  if (segments.length === 0) return prefix;
  if (prefix === "~") return `~/${segments.join("/")}`;
  if (prefix === "/") return `/${segments.join("/")}`;
  return segments.join("/");
}

function truncateTailSegment(segment: string, maxLength: number): string {
  if (segment.length <= maxLength) return segment;
  if (maxLength <= 1) return "…";

  const extStart = segment.lastIndexOf(".");
  const hasExt = extStart > 0 && extStart < segment.length - 1;
  if (!hasExt) {
    return `…${segment.slice(-(maxLength - 1))}`;
  }

  const ext = segment.slice(extStart);
  const base = segment.slice(0, extStart);
  const budget = maxLength - ext.length - 1;
  if (budget <= 0) {
    return `…${ext.slice(-(maxLength - 1))}`;
  }
  return `…${base.slice(-budget)}${ext}`;
}

export function shortenDisplayPath(
  fullPath: string,
  options: ShortenDisplayPathOptions = {},
): string {
  if (!fullPath) return "";

  const homeDir = options.homeDir ?? "";
  const keepTailSegments = Math.max(1, options.keepTailSegments ?? 1);
  const maxLength = options.maxLength ?? Number.POSITIVE_INFINITY;

  let display = fullPath;
  if (homeDir) {
    if (fullPath === homeDir) {
      display = "~";
    } else if (fullPath.startsWith(`${homeDir}/`)) {
      display = `~${fullPath.slice(homeDir.length)}`;
    }
  }

  const prefix: "~" | "/" | "" = display.startsWith("~")
    ? "~"
    : display.startsWith("/")
      ? "/"
      : "";
  const rawParts = display.split("/").filter(Boolean);
  const parts = prefix === "~" ? rawParts.slice(1) : rawParts;
  if (parts.length === 0) return display;

  if (parts.length <= keepTailSegments) {
    return display;
  }

  const tail = parts.slice(-keepTailSegments);
  const head = parts.slice(0, -keepTailSegments).map(abbreviateSegment);
  const shortened = joinDisplayPath(prefix, [...head, ...tail]);
  if (shortened.length <= maxLength) {
    return shortened;
  }

  const ellipsisCandidate = joinDisplayPath(prefix, ["…", ...tail]);
  if (ellipsisCandidate.length <= maxLength) {
    return ellipsisCandidate;
  }

  const last = tail[tail.length - 1] ?? "";
  const ellipsisPrefix = joinDisplayPath(prefix, ["…"]);
  const budget = Math.max(1, maxLength - `${ellipsisPrefix}/`.length);
  return `${ellipsisPrefix}/${truncateTailSegment(last, budget)}`;
}
