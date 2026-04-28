import { db, schema } from "@/lib/db";
import { desc, sql, and, eq } from "drizzle-orm";
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
import { KeyboardNav } from "@/components/keyboard-nav";
import { GitCommit, Users, FolderGit2, Calendar } from "lucide-react";

export const dynamic = "force-dynamic";

function getWeekLabel(mondayStr: string): string {
  const d = new Date(`${mondayStr}T00:00:00Z`);
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNum}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function WeekPage({
  params,
}: {
  params: Promise<{ start: string }>;
}) {
  const { start } = await params;
  const end = addDays(start, 6);
  const weekLabel = getWeekLabel(start);
  const prevWeek = addDays(start, -7);
  // Cap nextWeek at the current week — no navigating into the future.
  const today = new Date().toISOString().slice(0, 10);
  const candidateNext = addDays(start, 7);
  const nextWeek: string | null = candidateNext > today ? null : candidateNext;

  const startTs = new Date(`${start}T00:00:00Z`).getTime() / 1000;
  const endTs = new Date(`${end}T23:59:59Z`).getTime() / 1000;

  // Weekly totals
  const weeklyTotals = await db
    .select({
      commits: sql<number>`count(*)`,
      engineers: sql<number>`count(distinct ${schema.commits.engineerId})`,
      repos: sql<number>`count(distinct ${schema.commits.repoId})`,
      linesAdded: sql<number>`sum(${schema.commits.linesAdded})`,
      linesDeleted: sql<number>`sum(${schema.commits.linesDeleted})`,
    })
    .from(schema.commits)
    .where(
      and(
        sql`${schema.commits.committedAt} >= ${startTs}`,
        sql`${schema.commits.committedAt} <= ${endTs}`
      )
    );

  const totals = weeklyTotals[0];

  // Daily breakdown for this week
  const dailyBreakdown = await db
    .select({
      date: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
      commits: sql<number>`count(*)`,
      engineers: sql<number>`count(distinct ${schema.commits.engineerId})`,
      repos: sql<number>`count(distinct ${schema.commits.repoId})`,
      linesAdded: sql<number>`sum(${schema.commits.linesAdded})`,
      linesDeleted: sql<number>`sum(${schema.commits.linesDeleted})`,
    })
    .from(schema.commits)
    .where(
      and(
        sql`${schema.commits.committedAt} >= ${startTs}`,
        sql`${schema.commits.committedAt} <= ${endTs}`
      )
    )
    .groupBy(sql`date(${schema.commits.committedAt}, 'unixepoch')`)
    .orderBy(sql`date(${schema.commits.committedAt}, 'unixepoch')`);

  // Engineer × Repo contribution matrix
  const matrix = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      repoName: schema.repos.name,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`sum(${schema.commits.linesAdded})`,
      linesDeleted: sql<number>`sum(${schema.commits.linesDeleted})`,
    })
    .from(schema.commits)
    .innerJoin(schema.engineers, eq(schema.commits.engineerId, schema.engineers.id))
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .where(
      and(
        sql`${schema.commits.committedAt} >= ${startTs}`,
        sql`${schema.commits.committedAt} <= ${endTs}`
      )
    )
    .groupBy(schema.engineers.id, schema.repos.id)
    .orderBy(desc(sql`count(*)`));

  // Pivot: rows = engineers, cols = repos
  const engineerMap = new Map<
    string,
    {
      displayName: string;
      total: number;
      linesAdded: number;
      linesDeleted: number;
      repos: Map<string, { commits: number; linesAdded: number; linesDeleted: number }>;
    }
  >();
  const repoSet = new Set<string>();
  for (const row of matrix) {
    repoSet.add(row.repoName);
    const existing = engineerMap.get(row.username) || {
      displayName: row.displayName || row.username,
      total: 0,
      linesAdded: 0,
      linesDeleted: 0,
      repos: new Map<string, { commits: number; linesAdded: number; linesDeleted: number }>(),
    };
    existing.total += row.commits;
    existing.linesAdded += row.linesAdded || 0;
    existing.linesDeleted += row.linesDeleted || 0;
    existing.repos.set(row.repoName, {
      commits: row.commits,
      linesAdded: row.linesAdded || 0,
      linesDeleted: row.linesDeleted || 0,
    });
    engineerMap.set(row.username, existing);
  }
  const engineers = [...engineerMap.entries()].sort((a, b) => b[1].total - a[1].total);

  // Per-engineer one-line summary for the week, picked from the day-with-most-commits
  // workSummary in daily_analyses (already AI-generated). Fast, no extra Claude calls.
  const summaryRows = await db
    .select({
      username: schema.engineers.username,
      date: schema.dailyAnalyses.date,
      commitCount: schema.dailyAnalyses.commitCount,
      workSummary: schema.dailyAnalyses.workSummary,
    })
    .from(schema.dailyAnalyses)
    .innerJoin(
      schema.engineers,
      eq(schema.dailyAnalyses.engineerId, schema.engineers.id)
    )
    .where(
      and(
        sql`${schema.dailyAnalyses.date} >= ${start}`,
        sql`${schema.dailyAnalyses.date} <= ${end}`
      )
    );
  const summaryByEngineer = new Map<string, string>();
  for (const r of summaryRows) {
    if (!r.workSummary) continue;
    const cur = summaryByEngineer.get(r.username);
    if (!cur || r.commitCount > 0) {
      // pick the latest non-empty summary; fall back to longest commit day
      const existingScore = cur
        ? parseInt(cur.split("|")[0]) || 0
        : -1;
      if (r.commitCount >= existingScore) {
        summaryByEngineer.set(r.username, `${r.commitCount}|${r.workSummary}`);
      }
    }
  }
  // Strip the score prefix used for picking
  for (const [u, val] of summaryByEngineer) {
    summaryByEngineer.set(u, val.split("|").slice(1).join("|"));
  }

  // Silence unused-var lint — repo set is no longer used now that we render
  // per-engineer rows of only repos they touched.
  void repoSet;

  return (
    <div className="space-y-6">
      <KeyboardNav
        prevHref={`/week/${prevWeek}`}
        nextHref={nextWeek ? `/week/${nextWeek}` : null}
      />
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Link href={`/week/${prevWeek}`} className="text-sm text-primary hover:underline">
          &larr; {getWeekLabel(prevWeek)}
        </Link>
        <div className="text-center">
          <h1 className="text-xl font-bold">{weekLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {start} → {end}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Use <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">←</kbd>{" "}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">→</kbd> to
            navigate
          </p>
        </div>
        {nextWeek ? (
          <Link href={`/week/${nextWeek}`} className="text-sm text-primary hover:underline">
            {getWeekLabel(nextWeek)} &rarr;
          </Link>
        ) : (
          <span className="w-[60px]" />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <GitCommit className="h-3 w-3" /> Commits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totals?.commits || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <Users className="h-3 w-3" /> Engineers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totals?.engineers || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <FolderGit2 className="h-3 w-3" /> Repos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totals?.repos || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Lines Changed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-mono">
              <span className="text-emerald-600">+{totals?.linesAdded || 0}</span>
              {" / "}
              <span className="text-red-600">-{totals?.linesDeleted || 0}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Daily Breakdown
          </CardTitle>
          <CardDescription>Click a date to drill into that day</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[20%]">Date</TableHead>
                <TableHead className="w-[15%] text-right">Commits</TableHead>
                <TableHead className="w-[15%] text-right">Engineers</TableHead>
                <TableHead className="w-[15%] text-right">Repos</TableHead>
                <TableHead className="w-[35%] text-right">Lines</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyBreakdown.map((d) => (
                <TableRow key={d.date}>
                  <TableCell>
                    <Link href={`/daily/${d.date}`} className="font-mono hover:underline">
                      {d.date}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {d.commits}
                  </TableCell>
                  <TableCell className="text-right font-mono">{d.engineers}</TableCell>
                  <TableCell className="text-right font-mono">{d.repos}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    <span className="text-emerald-600">+{d.linesAdded || 0}</span>
                    {" / "}
                    <span className="text-red-600">-{d.linesDeleted || 0}</span>
                  </TableCell>
                </TableRow>
              ))}
              {dailyBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No activity this week
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-engineer contribution list */}
      <Card>
        <CardHeader>
          <CardTitle>Contributions by Engineer</CardTitle>
          <CardDescription>
            What each engineer worked on this week, broken down by repo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {engineers.map(([username, info]) => {
              const touchedRepos = [...info.repos.entries()].sort(
                (a, b) => b[1].commits - a[1].commits
              );
              return (
                <div
                  key={username}
                  className="grid grid-cols-1 md:grid-cols-[minmax(220px,1fr)_2fr] gap-4 py-4 first:pt-0 last:pb-0"
                >
                  {/* Left: engineer identity + summary */}
                  <div>
                    <Link
                      href={`/engineer/${username}`}
                      className="font-medium hover:underline"
                    >
                      {info.displayName}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      <span className="font-bold text-foreground">
                        {info.total}
                      </span>{" "}
                      commits ·{" "}
                      <span className="text-emerald-600">+{info.linesAdded}</span>
                      {" / "}
                      <span className="text-red-600">-{info.linesDeleted}</span>
                    </div>
                    {summaryByEngineer.get(username) && (
                      <p className="text-xs italic text-muted-foreground mt-2 leading-snug">
                        {summaryByEngineer.get(username)}
                      </p>
                    )}
                  </div>

                  {/* Right: repos worked on */}
                  <div className="flex flex-col gap-1.5">
                    {touchedRepos.map(([repo, cell]) => (
                      <div
                        key={repo}
                        className="flex items-center justify-between text-sm gap-3"
                      >
                        <Link
                          href={`/repo/${repo}`}
                          className="font-mono text-xs hover:underline truncate"
                        >
                          {repo}
                        </Link>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono font-bold text-sm">
                            {cell.commits}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground w-[110px] text-right">
                            <span className="text-emerald-600">
                              +{cell.linesAdded}
                            </span>
                            {" / "}
                            <span className="text-red-600">
                              -{cell.linesDeleted}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {engineers.length === 0 && (
              <div className="text-center text-muted-foreground py-6 text-sm">
                No contributions this week
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
