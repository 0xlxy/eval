import { getClaudeClient } from "./client";
import {
  SYSTEM_PROMPT,
  buildEngineerPrompt,
  buildOrgSummaryPrompt,
  type CommitSummary,
  type PrSummary,
  type EngineerDaySummary,
} from "./prompts";
import { db, schema } from "../db";
import { eq, and, sql } from "drizzle-orm";

interface AnalysisResult {
  workSummary: string;
  qualityAssessment: string;
  efficiencyScore: number;
  suggestions: string;
  highlights: string;
}

async function callClaude(userPrompt: string): Promise<string> {
  const client = getClaudeClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

function parseJSON<T>(text: string): T | null {
  try {
    // Extract JSON from possible markdown code blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as T;
    }
  } catch {
    // Parsing failed
  }
  return null;
}

export async function analyzeEngineer(
  engineerId: number,
  date: string
): Promise<AnalysisResult | null> {
  const engineer = await db.query.engineers.findFirst({
    where: eq(schema.engineers.id, engineerId),
  });
  if (!engineer) return null;

  // Get commits for this engineer on this date
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const engineerCommits = await db
    .select({
      sha: schema.commits.sha,
      message: schema.commits.message,
      linesAdded: schema.commits.linesAdded,
      linesDeleted: schema.commits.linesDeleted,
      filesChanged: schema.commits.filesChanged,
      repoName: schema.repos.name,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .where(
      and(
        eq(schema.commits.engineerId, engineerId),
        sql`${schema.commits.committedAt} >= ${dayStart.getTime() / 1000}`,
        sql`${schema.commits.committedAt} <= ${dayEnd.getTime() / 1000}`
      )
    );

  const engineerPrs = await db
    .select({
      title: schema.pullRequests.title,
      state: schema.pullRequests.state,
      additions: schema.pullRequests.additions,
      deletions: schema.pullRequests.deletions,
      repoName: schema.repos.name,
    })
    .from(schema.pullRequests)
    .innerJoin(
      schema.repos,
      eq(schema.pullRequests.repoId, schema.repos.id)
    )
    .where(
      and(
        eq(schema.pullRequests.engineerId, engineerId),
        sql`${schema.pullRequests.createdAtGh} >= ${dayStart.getTime() / 1000}`,
        sql`${schema.pullRequests.createdAtGh} <= ${dayEnd.getTime() / 1000}`
      )
    );

  if (engineerCommits.length === 0 && engineerPrs.length === 0) {
    return null;
  }

  const commits: CommitSummary[] = engineerCommits.map((c) => ({
    sha: c.sha.substring(0, 7),
    repoName: c.repoName,
    message: c.message,
    linesAdded: c.linesAdded,
    linesDeleted: c.linesDeleted,
    filesChanged: c.filesChanged,
  }));

  const prs: PrSummary[] = engineerPrs.map((p) => ({
    title: p.title || "",
    repoName: p.repoName,
    state: p.state,
    additions: p.additions,
    deletions: p.deletions,
  }));

  const prompt = buildEngineerPrompt({
    displayName: engineer.displayName || engineer.username,
    username: engineer.username,
    date,
    commits,
    prs,
  });

  const responseText = await callClaude(prompt);
  const result = parseJSON<AnalysisResult>(responseText);

  if (!result) {
    console.error(`Failed to parse Claude response for ${engineer.username}`);
    return null;
  }

  // Store analysis
  const totalAdded = commits.reduce((s, c) => s + c.linesAdded, 0);
  const totalDeleted = commits.reduce((s, c) => s + c.linesDeleted, 0);
  const totalFiles = commits.reduce((s, c) => s + c.filesChanged, 0);
  const prsMerged = prs.filter((p) => p.state === "merged").length;
  const prsOpened = prs.filter((p) => p.state === "open").length;

  // Upsert daily analysis
  const existing = await db.query.dailyAnalyses.findFirst({
    where: and(
      eq(schema.dailyAnalyses.engineerId, engineerId),
      eq(schema.dailyAnalyses.date, date)
    ),
  });

  const values = {
    engineerId,
    date,
    commitCount: commits.length,
    totalLinesAdded: totalAdded,
    totalLinesDeleted: totalDeleted,
    totalFilesChanged: totalFiles,
    prsMerged,
    prsOpened,
    workSummary: result.workSummary,
    qualityAssessment: result.qualityAssessment,
    efficiencyScore: result.efficiencyScore,
    suggestions: result.suggestions,
    highlights: result.highlights,
    rawAnalysis: responseText,
  };

  if (existing) {
    await db
      .update(schema.dailyAnalyses)
      .set(values)
      .where(eq(schema.dailyAnalyses.id, existing.id));
  } else {
    await db.insert(schema.dailyAnalyses).values(values);
  }

  return result;
}

export async function analyzeOrg(date: string): Promise<void> {
  // Get all analyses for this date
  const analyses = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commitCount: schema.dailyAnalyses.commitCount,
      linesAdded: schema.dailyAnalyses.totalLinesAdded,
      linesDeleted: schema.dailyAnalyses.totalLinesDeleted,
      efficiencyScore: schema.dailyAnalyses.efficiencyScore,
      workSummary: schema.dailyAnalyses.workSummary,
    })
    .from(schema.dailyAnalyses)
    .innerJoin(
      schema.engineers,
      eq(schema.dailyAnalyses.engineerId, schema.engineers.id)
    )
    .where(eq(schema.dailyAnalyses.date, date));

  if (analyses.length === 0) return;

  // Count active repos
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);
  const activeReposResult = await db
    .selectDistinct({ repoId: schema.commits.repoId })
    .from(schema.commits)
    .where(
      and(
        sql`${schema.commits.committedAt} >= ${dayStart.getTime() / 1000}`,
        sql`${schema.commits.committedAt} <= ${dayEnd.getTime() / 1000}`
      )
    );

  const totalCommits = analyses.reduce((s, a) => s + a.commitCount, 0);
  const totalPrsMerged = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.pullRequests)
    .where(
      and(
        eq(schema.pullRequests.state, "merged"),
        sql`${schema.pullRequests.mergedAt} >= ${dayStart.getTime() / 1000}`,
        sql`${schema.pullRequests.mergedAt} <= ${dayEnd.getTime() / 1000}`
      )
    );

  const engineerSummaries: EngineerDaySummary[] = analyses.map((a) => ({
    username: a.username,
    displayName: a.displayName || a.username,
    commitCount: a.commitCount,
    linesAdded: a.linesAdded,
    linesDeleted: a.linesDeleted,
    efficiencyScore: a.efficiencyScore || 0,
    workSummary: a.workSummary || "",
  }));

  const prompt = buildOrgSummaryPrompt({
    date,
    totalCommits,
    totalPrsMerged: totalPrsMerged[0]?.count || 0,
    activeRepos: activeReposResult.length,
    engineerSummaries,
  });

  const responseText = await callClaude(prompt);
  const result = parseJSON<{
    orgSummary: string;
    topContributors: string[];
  }>(responseText);

  // Upsert org summary
  const existing = await db.query.dailyOrgSummaries.findFirst({
    where: eq(schema.dailyOrgSummaries.date, date),
  });

  const values = {
    date,
    totalCommits,
    totalPrsMerged: totalPrsMerged[0]?.count || 0,
    activeEngineers: analyses.length,
    activeRepos: activeReposResult.length,
    orgSummary: result?.orgSummary || "",
    topContributors: JSON.stringify(result?.topContributors || []),
  };

  if (existing) {
    await db
      .update(schema.dailyOrgSummaries)
      .set(values)
      .where(eq(schema.dailyOrgSummaries.id, existing.id));
  } else {
    await db.insert(schema.dailyOrgSummaries).values(values);
  }
}

export async function runFullAnalysis(date: string): Promise<{
  analyzedEngineers: number;
}> {
  // Get all engineers who had activity on this date
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const activeEngineers = await db
    .selectDistinct({ id: schema.commits.engineerId })
    .from(schema.commits)
    .where(
      and(
        sql`${schema.commits.committedAt} >= ${dayStart.getTime() / 1000}`,
        sql`${schema.commits.committedAt} <= ${dayEnd.getTime() / 1000}`
      )
    );

  let analyzed = 0;
  for (const { id } of activeEngineers) {
    const result = await analyzeEngineer(id, date);
    if (result) analyzed++;
  }

  // Generate org summary
  await analyzeOrg(date);

  return { analyzedEngineers: analyzed };
}
