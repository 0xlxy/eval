/**
 * Shared helpers for separating "real" engineering work from bots,
 * vendored/generated changes, and other signal noise.
 */

/** Bot usernames that should be excluded from engineer rankings by default. */
export function isBotUsername(username: string): boolean {
  const u = username.toLowerCase();
  return (
    u.endsWith("[bot]") ||
    u.endsWith("-bot") ||
    u === "dependabot" ||
    u === "renovate" ||
    u === "github-actions" ||
    u === "devin-ai-integration[bot]"
  );
}

/** Threshold above which a commit is almost certainly a lockfile/generated bulk change. */
export const VENDORED_LINE_THRESHOLD = 5000;

/** Heuristic: flag commits that are likely generated code / lockfile dumps. */
export function isLikelyVendored(linesAdded: number, linesDeleted: number): boolean {
  return linesAdded + linesDeleted >= VENDORED_LINE_THRESHOLD;
}
