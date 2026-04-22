import { db, schema } from "@/lib/db";
import { desc, sql, eq, and } from "drizzle-orm";
import Link from "next/link";
import { isBotUsername, VENDORED_LINE_THRESHOLD } from "@/lib/filters";
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
 * Composite efficiency score (0-100), all sub-metrics normalized to team max:
 * - Volume (45%): commit count + non-vendored lines changed
 * - Consistency (35%): distinct active days
 * - Breadth (20%): distinct repos touched
 *
 * Vendored / generated commits (lockfile dumps, etc) are already stripped
 * upstream, so line totals here reflect real authored work. The older
 * "avg lines per commit" proxy was dropped — commit size is ambiguous on its
 * own and mostly penalized valid refactors.
 */
function computeScores(engineers: Omit<EngineerMetrics, "score" | "rank">[]): EngineerMetrics[] {
  if (engineers.length === 0) return [];

  const maxCommits = Math.max(...engineers.map((e) => e.commits), 1);
  const maxLines = Math.max(...engineers.map((e) => e.linesAdded + e.linesDeleted), 1);
  const maxActiveDays = Math.max(...engineers.map((e) => e.activeDays), 1);
  const maxRepos = Math.max(...engineers.map((e) => e.repos), 1);

  const scored = engineers.map((e) => {
    const commitNorm = e.commits / maxCommits;
    const linesNorm = (e.linesAdded + e.linesDeleted) / maxLines;
    const volume = (commitNorm + linesNorm) / 2;
    const consistency = e.activeDays / maxActiveDays;
    const breadth = e.repos / maxRepos;

    const score = Math.round(
      (volume * 0.45 + consistency * 0.35 + breadth * 0.2) * 100
    );
    return { ...e, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map((e, i) => ({ ...e, rank: i + 1 }));
}

export default async function EngineersPage(props: {
  searchParams?: Promise<{ includeBots?: string; includeVendored?: string }>;
}) {
  const searchParams = (await props.searchParams) || {};
  const includeBots = searchParams.includeBots === "1";
  const includeVendored = searchParams.includeVendored === "1";

  const vendoredFilter = includeVendored
    ? sql`1=1`
    : sql`${schema.commits.linesAdded} + ${schema.commits.linesDeleted} < ${VENDORED_LINE_THRESHOLD}`;

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
    .where(and(vendoredFilter))
    .groupBy(schema.engineers.id)
    .orderBy(desc(sql`count(*)`));

  const filteredAggregates = includeBots
    ? aggregates
    : aggregates.filter((a) => !isBotUsername(a.username));
  const hiddenBotCount = aggregates.length - filteredAggregates.length;

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

  const base = filteredAggregates.map((e) => ({
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
          Score = volume (45%) + consistency (35%) + breadth (20%), normalized to team max.
          {!includeBots && hiddenBotCount > 0 && (
            <>
              {" "}
              <span className="italic">
                {hiddenBotCount} bot account{hiddenBotCount > 1 ? "s" : ""} hidden.
              </span>
            </>
          )}
        </p>
        <div className="flex gap-2 mt-3 text-xs">
          <Link
            href={`?${new URLSearchParams({ ...(includeBots ? {} : { includeBots: "1" }), ...(includeVendored ? { includeVendored: "1" } : {}) })}`}
            className={`px-2 py-1 rounded border ${includeBots ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            {includeBots ? "✓ " : ""}Show bots
          </Link>
          <Link
            href={`?${new URLSearchParams({ ...(includeBots ? { includeBots: "1" } : {}), ...(includeVendored ? {} : { includeVendored: "1" }) })}`}
            className={`px-2 py-1 rounded border ${includeVendored ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}
          >
            {includeVendored ? "✓ " : ""}Include vendored commits (≥{VENDORED_LINE_THRESHOLD} lines)
          </Link>
        </div>
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
            <strong className="text-foreground">Volume (45%)</strong> — commit count and total
            non-vendored lines changed, normalized to the team max.
          </p>
          <p>
            <strong className="text-foreground">Consistency (35%)</strong> — number of distinct
            active days, normalized to the team max.
          </p>
          <p>
            <strong className="text-foreground">Breadth (20%)</strong> — number of repos touched,
            normalized to the team max.
          </p>
          <p className="text-xs italic mt-4">
            Commits ≥ {VENDORED_LINE_THRESHOLD} lines are treated as vendored/generated
            and excluded by default. Bot accounts are hidden by default. Use the toggles
            above to include them.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
