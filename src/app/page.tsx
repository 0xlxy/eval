import { db, schema } from "@/lib/db";
import { desc, eq, sql, and } from "drizzle-orm";
import { format, subDays } from "date-fns";
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
import {
  GitCommit,
  Users,
  GitPullRequest,
  FolderGit2,
  Brain,
} from "lucide-react";

export const dynamic = "force-dynamic";

async function getLatestDate(): Promise<string> {
  const latest = await db.query.dailyOrgSummaries.findFirst({
    orderBy: desc(schema.dailyOrgSummaries.date),
  });
  return latest?.date || format(subDays(new Date(), 1), "yyyy-MM-dd");
}

export default async function DashboardPage() {
  const date = await getLatestDate();

  const orgSummary = await db.query.dailyOrgSummaries.findFirst({
    where: eq(schema.dailyOrgSummaries.date, date),
  });

  const analyses = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      avatarUrl: schema.engineers.avatarUrl,
      commitCount: schema.dailyAnalyses.commitCount,
      totalLinesAdded: schema.dailyAnalyses.totalLinesAdded,
      totalLinesDeleted: schema.dailyAnalyses.totalLinesDeleted,
      efficiencyScore: schema.dailyAnalyses.efficiencyScore,
      workSummary: schema.dailyAnalyses.workSummary,
    })
    .from(schema.dailyAnalyses)
    .innerJoin(
      schema.engineers,
      eq(schema.dailyAnalyses.engineerId, schema.engineers.id)
    )
    .where(eq(schema.dailyAnalyses.date, date))
    .orderBy(desc(schema.dailyAnalyses.efficiencyScore));

  // Get repo activity for the day
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);
  const repoActivity = await db
    .select({
      name: schema.repos.name,
      commits: sql<number>`count(*)`,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .where(
      and(
        sql`${schema.commits.committedAt} >= ${dayStart.getTime() / 1000}`,
        sql`${schema.commits.committedAt} <= ${dayEnd.getTime() / 1000}`
      )
    )
    .groupBy(schema.repos.name)
    .orderBy(desc(sql`count(*)`));

  // Recent dates for navigation
  const recentDates = await db
    .select({ date: schema.dailyOrgSummaries.date })
    .from(schema.dailyOrgSummaries)
    .orderBy(desc(schema.dailyOrgSummaries.date))
    .limit(7);

  const avgScore =
    analyses.length > 0
      ? Math.round(
          analyses.reduce((s, a) => s + (a.efficiencyScore || 0), 0) /
            analyses.length
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Date Navigation */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        {recentDates.map((d) => (
          <Link
            key={d.date}
            href={`/daily/${d.date}`}
            className={`px-3 py-1 rounded-md transition-colors ${
              d.date === date
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            {d.date}
          </Link>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
            <GitCommit className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orgSummary?.totalCommits || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Active Engineers
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orgSummary?.activeEngineers || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">PRs Merged</CardTitle>
            <GitPullRequest className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {orgSummary?.totalPrsMerged || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Efficiency
            </CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgScore}/100</div>
          </CardContent>
        </Card>
      </div>

      {/* AI Summary */}
      {orgSummary?.orgSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Team Summary
            </CardTitle>
            <CardDescription>{date}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{orgSummary.orgSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Engineer Leaderboard + Repo Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Engineer Leaderboard</CardTitle>
              <CardDescription>Ranked by efficiency score</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Engineer</TableHead>
                    <TableHead className="text-right">Commits</TableHead>
                    <TableHead className="text-right">Lines</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyses.map((a, i) => (
                    <TableRow key={a.username}>
                      <TableCell className="font-mono">{i + 1}</TableCell>
                      <TableCell>
                        <Link
                          href={`/engineer/${a.username}`}
                          className="font-medium hover:underline"
                        >
                          {a.displayName || a.username}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate max-w-[300px]">
                          {a.workSummary}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {a.commitCount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        <span className="text-emerald-600">
                          +{a.totalLinesAdded}
                        </span>
                        /
                        <span className="text-red-600">
                          -{a.totalLinesDeleted}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <ScoreBadge score={a.efficiencyScore || 0} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {analyses.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground"
                      >
                        No data for this date
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderGit2 className="h-5 w-5" />
                Repo Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {repoActivity.map((r) => (
                  <div
                    key={r.name}
                    className="flex items-center justify-between"
                  >
                    <Link
                      href={`/repo/${r.name}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2 bg-primary rounded-full"
                        style={{
                          width: `${Math.max(20, (r.commits / Math.max(...repoActivity.map((x) => x.commits))) * 100)}px`,
                        }}
                      />
                      <span className="text-sm font-mono text-muted-foreground">
                        {r.commits}
                      </span>
                    </div>
                  </div>
                ))}
                {repoActivity.length === 0 && (
                  <p className="text-sm text-muted-foreground">No activity</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
