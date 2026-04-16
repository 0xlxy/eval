export const SYSTEM_PROMPT = `You are a senior engineering manager reviewing daily developer activity.
You provide constructive, specific, and actionable feedback.
Always be respectful and focus on the work, not the person.
Return your analysis as JSON matching the provided schema. Do not include any text outside the JSON object.`;

export interface CommitSummary {
  sha: string;
  repoName: string;
  message: string;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
}

export interface PrSummary {
  title: string;
  repoName: string;
  state: string;
  additions: number;
  deletions: number;
}

export function buildEngineerPrompt(params: {
  displayName: string;
  username: string;
  date: string;
  commits: CommitSummary[];
  prs: PrSummary[];
}): string {
  const totalAdded = params.commits.reduce((s, c) => s + c.linesAdded, 0);
  const totalDeleted = params.commits.reduce((s, c) => s + c.linesDeleted, 0);
  const totalFiles = params.commits.reduce((s, c) => s + c.filesChanged, 0);

  const commitSection = params.commits
    .map(
      (c) =>
        `- [${c.repoName}] ${c.message.split("\n")[0]} (+${c.linesAdded}/-${c.linesDeleted}, ${c.filesChanged} files)`
    )
    .join("\n");

  const prSection =
    params.prs.length > 0
      ? params.prs
          .map(
            (p) =>
              `- [${p.repoName}] ${p.title} (${p.state}, +${p.additions}/-${p.deletions})`
          )
          .join("\n")
      : "None";

  return `Analyze the following daily activity for engineer ${params.displayName} (${params.username}) on ${params.date}.

## Commits (${params.commits.length} total, +${totalAdded}/-${totalDeleted} lines, ${totalFiles} files)
${commitSection || "No commits"}

## Pull Requests
${prSection}

Respond with this exact JSON structure:
{
  "workSummary": "ONE short sentence (max 20 words) capturing what was done. No preamble like 'Engineer X' — just the work.",
  "qualityAssessment": "1 short sentence on code quality",
  "efficiencyScore": <number 1-100>,
  "suggestions": "1 short sentence with an actionable suggestion",
  "highlights": "1 short phrase highlighting a notable contribution, or empty string"
}`;
}

export interface EngineerDaySummary {
  username: string;
  displayName: string;
  commitCount: number;
  linesAdded: number;
  linesDeleted: number;
  efficiencyScore: number;
  workSummary: string;
}

export function buildOrgSummaryPrompt(params: {
  date: string;
  totalCommits: number;
  totalPrsMerged: number;
  activeRepos: number;
  engineerSummaries: EngineerDaySummary[];
}): string {
  const engineerSection = params.engineerSummaries
    .sort((a, b) => b.efficiencyScore - a.efficiencyScore)
    .map(
      (e) =>
        `- ${e.displayName} (${e.username}): ${e.commitCount} commits, +${e.linesAdded}/-${e.linesDeleted}, score: ${e.efficiencyScore}/100. ${e.workSummary}`
    )
    .join("\n");

  return `Summarize the engineering team's activity for ${params.date}.
${params.engineerSummaries.length} engineers were active across ${params.activeRepos} repos.
Total: ${params.totalCommits} commits, ${params.totalPrsMerged} PRs merged.

## Engineer Summaries
${engineerSection}

Provide a concise 3-4 sentence team summary highlighting key accomplishments and any areas of concern.
Return only a JSON object:
{
  "orgSummary": "3-4 sentence team summary",
  "topContributors": ["username1", "username2", "username3"]
}`;
}
