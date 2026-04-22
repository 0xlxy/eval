import { db, schema } from "@/lib/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
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
import { ScoreTrendChart } from "@/components/trend-chart";
import { GitCommit, TrendingUp, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EngineerPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const engineer = await db.query.engineers.findFirst({
    where: eq(schema.engineers.username, username),
  });

  if (!engineer) notFound();

  // Get last 30 days of analyses
  const analyses = await db
    .select()
    .from(schema.dailyAnalyses)
    .where(eq(schema.dailyAnalyses.engineerId, engineer.id))
    .orderBy(desc(schema.dailyAnalyses.date))
    .limit(30);

  const latestAnalysis = analyses[0];

  // Team-average score per date over the same window — used as a baseline on the trend chart.
  const dates = analyses.map((a) => a.date);
  let baselineByDate = new Map<string, number>();
  if (dates.length > 0) {
    const teamAverages = await db
      .select({
        date: schema.dailyAnalyses.date,
        avg: sql<number>`avg(${schema.dailyAnalyses.efficiencyScore})`,
      })
      .from(schema.dailyAnalyses)
      .where(sql`${schema.dailyAnalyses.date} IN ${dates}`)
      .groupBy(schema.dailyAnalyses.date);
    baselineByDate = new Map(
      teamAverages.map((t) => [t.date, Math.round(t.avg || 0)])
    );
  }

  // Score trend data with team baseline overlay
  const trendData = [...analyses].reverse().map((a) => ({
    date: a.date.substring(5), // MM-DD
    value: a.efficiencyScore || 0,
    baseline: baselineByDate.get(a.date),
  }));

  // Repos per day for this engineer
  const reposPerDay = await db
    .select({
      date: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
      repoName: schema.repos.name,
      commits: sql<number>`count(*)`,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .where(eq(schema.commits.engineerId, engineer.id))
    .groupBy(sql`date(${schema.commits.committedAt}, 'unixepoch')`, schema.repos.id);

  const reposByDate = new Map<string, { repoName: string; commits: number }[]>();
  for (const r of reposPerDay) {
    const list = reposByDate.get(r.date) || [];
    list.push({ repoName: r.repoName, commits: r.commits });
    reposByDate.set(r.date, list);
  }

  // Recent commits
  const recentCommits = await db
    .select({
      sha: schema.commits.sha,
      message: schema.commits.message,
      repoName: schema.repos.name,
      linesAdded: schema.commits.linesAdded,
      linesDeleted: schema.commits.linesDeleted,
      committedAt: schema.commits.committedAt,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .where(eq(schema.commits.engineerId, engineer.id))
    .orderBy(desc(schema.commits.committedAt))
    .limit(20);

  // Aggregate stats
  const totalCommits = analyses.reduce((s, a) => s + a.commitCount, 0);
  const avgScore =
    analyses.length > 0
      ? Math.round(
          analyses.reduce((s, a) => s + (a.efficiencyScore || 0), 0) /
            analyses.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">
          {engineer.displayName || engineer.username}
        </h1>
        <p className="text-muted-foreground">@{engineer.username}</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              30-Day Commits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCommits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Efficiency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgScore}/100</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Days</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyses.length}/30</div>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      {trendData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Efficiency Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScoreTrendChart
              data={trendData}
              engineerName={engineer.displayName || engineer.username}
            />
          </CardContent>
        </Card>
      )}

      {/* Latest AI Analysis */}
      {latestAnalysis && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Latest Summary</CardTitle>
              <CardDescription>{latestAnalysis.date}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">{latestAnalysis.workSummary}</p>
              {latestAnalysis.qualityAssessment && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Quality Assessment
                  </p>
                  <p className="text-sm">{latestAnalysis.qualityAssessment}</p>
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Lightbulb className="h-4 w-4" />
                Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{latestAnalysis.suggestions}</p>
              {latestAnalysis.highlights && (
                <div className="mt-3 p-2 bg-emerald-50 rounded-md">
                  <p className="text-sm text-emerald-800">
                    {latestAnalysis.highlights}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Daily Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Commits</TableHead>
                <TableHead className="text-right">Lines</TableHead>
                <TableHead>Repos</TableHead>
                <TableHead className="text-center">Score</TableHead>
                <TableHead className="w-[45%]">Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {analyses.map((a) => {
                const repos = reposByDate.get(a.date) || [];
                return (
                  <TableRow key={a.date} className="align-top">
                    <TableCell className="font-mono text-sm">{a.date}</TableCell>
                    <TableCell className="text-right font-mono">
                      {a.commitCount}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                      <span className="text-emerald-600">
                        +{a.totalLinesAdded}
                      </span>
                      /
                      <span className="text-red-600">-{a.totalLinesDeleted}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {repos.map((r) => (
                          <span
                            key={r.repoName}
                            className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted font-mono text-[10px]"
                          >
                            {r.repoName}
                            <span className="ml-1 text-muted-foreground">
                              {r.commits}
                            </span>
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <ScoreBadge score={a.efficiencyScore || 0} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground leading-relaxed whitespace-normal">
                      {a.workSummary}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Commits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCommit className="h-5 w-5" />
            Recent Commits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentCommits.map((c) => (
              <div
                key={c.sha}
                className="flex items-start gap-3 py-2 border-b last:border-0"
              >
                <Link
                  href={`/commit/${c.sha.substring(0, 12)}`}
                  className="text-xs text-muted-foreground mt-0.5 font-mono hover:text-primary hover:underline"
                >
                  {c.sha.substring(0, 7)}
                </Link>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{c.message.split("\n")[0]}</p>
                  <p className="text-xs text-muted-foreground">
                    {c.repoName} &middot;{" "}
                    <span className="text-emerald-600">+{c.linesAdded}</span>/
                    <span className="text-red-600">-{c.linesDeleted}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
