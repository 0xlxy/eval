/**
 * Parse Conventional-Commits-ish prefix from a commit message.
 * Returns one of the canonical tags or "other".
 */
export type CommitTag =
  | "feat"
  | "fix"
  | "refactor"
  | "chore"
  | "docs"
  | "test"
  | "style"
  | "perf"
  | "build"
  | "ci"
  | "revert"
  | "merge"
  | "other";

const TAG_ALIASES: Record<string, CommitTag> = {
  feat: "feat",
  feature: "feat",
  fix: "fix",
  bug: "fix",
  bugfix: "fix",
  hotfix: "fix",
  refactor: "refactor",
  refact: "refactor",
  chore: "chore",
  docs: "docs",
  doc: "docs",
  test: "test",
  tests: "test",
  style: "style",
  perf: "perf",
  build: "build",
  ci: "ci",
  revert: "revert",
};

export function extractCommitTag(message: string): CommitTag {
  const firstLine = message.split("\n")[0].trim();

  // Merge commits are common and worth separating out
  if (/^merge\b/i.test(firstLine) || /^merged?\s+(pull request|branch)/i.test(firstLine)) {
    return "merge";
  }

  // Conventional-commits pattern: `type(scope): subject` or `type: subject`
  const match = firstLine.match(/^([a-zA-Z]+)(?:\([^)]*\))?!?:/);
  if (match) {
    const tag = TAG_ALIASES[match[1].toLowerCase()];
    if (tag) return tag;
  }
  return "other";
}

export const TAG_ORDER: CommitTag[] = [
  "feat",
  "fix",
  "refactor",
  "perf",
  "test",
  "docs",
  "style",
  "chore",
  "build",
  "ci",
  "revert",
  "merge",
  "other",
];

export const TAG_COLORS: Record<CommitTag, string> = {
  feat: "bg-emerald-100 text-emerald-800",
  fix: "bg-red-100 text-red-800",
  refactor: "bg-blue-100 text-blue-800",
  perf: "bg-amber-100 text-amber-800",
  test: "bg-purple-100 text-purple-800",
  docs: "bg-slate-100 text-slate-700",
  style: "bg-pink-100 text-pink-800",
  chore: "bg-gray-100 text-gray-700",
  build: "bg-orange-100 text-orange-800",
  ci: "bg-cyan-100 text-cyan-800",
  revert: "bg-yellow-100 text-yellow-800",
  merge: "bg-indigo-100 text-indigo-800",
  other: "bg-muted text-muted-foreground",
};
