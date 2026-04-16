import { db, schema } from "@/lib/db";
import { desc, sql, eq } from "drizzle-orm";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScoreBadge } from "@/components/score-badge";

export const dynamic = "force-dynamic";

interface EngineerMetrics {
  username: string;
  displayName: string;
  commits: number;
  linesAdded: number;
  linesDeleted: number;
  filesChanged: number;
  repos: number;
  activeDays: number;
  avgCommitsPerDay: number;
  avgLinesPerCommit: number;
  score: number;
  rank: number;
  topRepo: string;
}

/**
 * Composite efficiency score (0-100) combining:
 * - Volume: commits and lines changed (40%)
 * - Consistency: active days (30%)
 * - Breadth: number of distinct repos touched (15%)
 * - Quality proxy: avg lines per commit — penalizes mega-commits and zero-stat commits (15%)
 *
 * Each sub-metric is normalized relative to the max across the team,
 * so scores are relative to the current cohort.
 */
function computeScores(engineers: Omit<EngineerMetrics, "score" | "rank">[]): EngineerMetrics[] {
  if (engineers.length === 0) return [];

  const maxCommits = Math.max(...engineers.map((e) => e.commits), 1);
  const maxLines = Math.max(...engineers.map((e) => e.linesAdded + e.linesDeleted), 1);
  const maxActiveDays = Math.max(...engineers.map((e) => e.activeDays), 1);
  const maxRepos = Math.max(...engineers.map((e) => e.repos), 1);

  const scored = engineers.map((e) => {
    // Volume: geometric blend of commit count and total line changes
    const commitNorm = e.commits / maxCommits;
    const linesNorm = (e.linesAdded + e.linesDeleted) / maxLines;
    const volume = (commitNorm + linesNorm) / 2;

    // Consistency
    const consistency = e.activeDays / maxActiveDays;

    // Breadth
    const breadth = e.repos / maxRepos;

    // Quality proxy — favor "healthy" commit size (30-500 lines)
    // Commits that are too small (<5 lines) or huge (>2000) get penalized
    const avgLines = e.avgLinesPerCommit;
    let quality = 0.5;
    if (avgLines >= 20 && avgLines <= 500) quality = 1.0;
    else if (avgLines >= 5 && avgLines < 20) quality = 0.7;
    else if (avgLines > 500 && avgLines <= 2000) quality = 0.7;
    else if (avgLines > 2000) quality = 0.3;
    else if (avgLines < 5) quality = 0.3;

    const score = Math.round(
      (volume * 0.4 + consistency * 0.3 + breadth * 0.15 + quality * 0.15) * 100
    );

    return { ...e, score };
  });

  // Rank
  scored.sort((a, b) => b.score - a.score);
  return scored.map((e, i) => ({ ...e, rank: i + 1 }));
}

export default async function EngineersPage() {
  // Aggregate commit data per engineer
  const aggregates = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`coalesce(sum(${schema.commits.linesAdded}), 0)`,
      linesDeleted: sql<number>`coalesce(sum(${schema.commits.linesDeleted}), 0)`,
      filesChanged: sql<number>`coalesce(sum(${schema.commits.filesChanged}), 0)`,
      repos: sql<number>`count(distinct ${schema.commits.repoId})`,
      activeDays: sql<number>`count(distinct date(${schema.commits.committedAt}, 'unixepoch'))`,
    })
    .from(schema.commits)
    .innerJoin(
      schema.engineers,
      eq(schema.commits.engineerId, schema.engineers.id)
    )
    .groupBy(schema.engineers.id)
    .orderBy(desc(sql`count(*)`));

  // Top repo per engineer
  const topRepos = await db
    .select({
      username: schema.engineers.username,
      repoName: schema.repos.name,
      commits: sql<number>`count(*)`,
    })
    .from(schema.commits)
    .innerJoin(schema.engineers, eq(schema.commits.engineerId, schema.engineers.id))
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .groupBy(schema.engineers.id, schema.repos.id);

  const topRepoByEng = new Map<string, { repoName: string; commits: number }>();
  for (const row of topRepos) {
    const existing = topRepoByEng.get(row.username);
    if (!existing || row.commits > existing.commits) {
      topRepoByEng.set(row.username, { repoName: row.repoName, commits: row.commits });
    }
  }

  const base = aggregates.map((e) => ({
    username: e.username,
    displayName: e.displayName || e.username,
    commits: e.commits,
    linesAdded: e.linesAdded,
    linesDeleted: e.linesDeleted,
    filesChanged: e.filesChanged,
    repos: e.repos,
    activeDays: e.activeDays,
    avgCommitsPerDay: e.activeDays > 0 ? e.commits / e.activeDays : 0,
    avgLinesPerCommit:
      e.commits > 0 ? (e.linesAdded + e.linesDeleted) / e.commits : 0,
    topRepo: topRepoByEng.get(e.username)?.repoName || "-",
  }));

  const engineers = computeScores(base);

  const avgScore =
    engineers.length > 0
      ? Math.round(
          engineers.reduce((s, e) => s + e.score, 0) / engineers.length
        )
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Engineer Evaluation</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Efficiency score based on commit volume, consistency, repo breadth, and commit quality.
          All metrics span Jan 1 – Apr 15, 2026.
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Engineers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{engineers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Avg Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{avgScore}/100</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Top Performer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-bold truncate">
              {engineers[0]?.displayName || "-"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Most Consistent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-base font-bold truncate">
              {[...engineers]
                .sort((a, b) => b.activeDays - a.activeDays)[0]
                ?.displayName || "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Engineer table */}
      <Card>
        <CardHeader>
          <CardTitle>All Engineers</CardTitle>
          <CardDescription>Sorted by efficiency score (high to low)</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Engineer</TableHead>
                <TableHead className="text-right">Commits</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead className="text-right">Files</TableHead>
                <TableHead className="text-right">Repos</TableHead>
                <TableHead className="text-right">Active Days</TableHead>
                <TableHead className="text-right">Commits/Day</TableHead>
                <TableHead className="text-right">Lines/Commit</TableHead>
                <TableHead>Top Repo</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.map((e) => (
                <TableRow key={e.username}>
                  <TableCell className="font-mono">{e.rank}</TableCell>
                  <TableCell>
                    <Link
                      href={`/engineer/${e.username}`}
                      className="font-medium hover:underline"
                    >
                      {e.displayName}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      @{e.username}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {e.commits}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    <span className="text-emerald-600">+{e.linesAdded}</span>
                    {" / "}
                    <span className="text-red-600">-{e.linesDeleted}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {e.filesChanged}
                  </TableCell>
                  <TableCell className="text-right font-mono">{e.repos}</TableCell>
                  <TableCell className="text-right font-mono">
                    {e.activeDays}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {e.avgCommitsPerDay.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {Math.round(e.avgLinesPerCommit)}
                  </TableCell>
                  <TableCell>
                    {e.topRepo !== "-" ? (
                      <Link
                        href={`/repo/${e.topRepo}`}
                        className="text-sm hover:underline font-mono"
                      >
                        {e.topRepo}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <ScoreBadge score={e.score} />
                  </TableCell>
                </TableRow>
              ))}
              {engineers.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-muted-foreground"
                  >
                    No engineer data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Scoring methodology */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring Methodology</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>
            <strong className="text-foreground">Volume (40%)</strong> — commit count and total
            lines changed, normalized to the team max.
          </p>
          <p>
            <strong className="text-foreground">Consistency (30%)</strong> — number of distinct
            active days, normalized to the team max.
          </p>
          <p>
            <strong className="text-foreground">Breadth (15%)</strong> — number of repos touched,
            normalized to the team max.
          </p>
          <p>
            <strong className="text-foreground">Quality (15%)</strong> — commit size heuristic;
            commits averaging 20–500 lines scored highest, tiny or mega commits penalized.
          </p>
          <p className="text-xs italic mt-4">
            All scores are relative to the current cohort. A score of 100 means
            best-in-team across all four dimensions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
