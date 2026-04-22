import { db, schema } from "@/lib/db";
import { desc, sql, and } from "drizzle-orm";
import Link from "next/link";
import {
  getWeeklyStats,
  getTotalCounts,
  getEngineerLeaderboard,
  getRepoActivity,
  getWeekRangeStats,
} from "@/lib/cached-queries";
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
import {
  GitCommit,
  Users,
  FolderGit2,
  Calendar,
} from "lucide-react";

export const dynamic = "force-dynamic";

function getWeekLabel(mondayStr: string): string {
  // ISO week number from the Monday of the week
  const d = new Date(`${mondayStr}T00:00:00Z`);
  const thu = new Date(d);
  thu.setUTCDate(d.getUTCDate() + 3); // Thursday of that week
  const yearStart = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `W${weekNum}`;
}

function getWeekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diffToMon);
  const sun = new Date(mon);
  sun.setUTCDate(mon.getUTCDate() + 6);
  return {
    start: mon.toISOString().slice(0, 10),
    end: sun.toISOString().slice(0, 10),
  };
}

interface WeekData {
  weekLabel: string;
  start: string;
  end: string;
  commits: number;
  engineers: number;
  repos: number;
}

export default async function DashboardPage() {
  // Get all commit dates grouped by week (cached)
  const weeklyStats = await getWeeklyStats();

  // Aggregate into weeks
  const weekMap = new Map<string, WeekData>();
  for (const day of weeklyStats) {
    const { start, end } = getWeekRange(day.date);
    const key = start;
    const existing = weekMap.get(key);
    if (existing) {
      existing.commits += day.commits;
    } else {
      weekMap.set(key, {
        weekLabel: getWeekLabel(start),
        start,
        end,
        commits: day.commits,
        engineers: 0,
        repos: 0,
      });
    }
  }

  // Fill per-week engineer/repo counts (each call cached by its args)
  await Promise.all(
    [...weekMap.values()].map(async (week) => {
      const startTs = new Date(`${week.start}T00:00:00Z`).getTime() / 1000;
      const endTs = new Date(`${week.end}T23:59:59Z`).getTime() / 1000;
      const { engineers, repos } = await getWeekRangeStats(startTs, endTs);
      week.engineers = engineers;
      week.repos = repos;
    })
  );

  const weeks = [...weekMap.values()].sort((a, b) => b.start.localeCompare(a.start));

  // Overall stats (cached)
  const totalCommits = weeks.reduce((s, w) => s + w.commits, 0);
  const { engineers: totalEngineers, repos: totalRepos } = await getTotalCounts();
  const engineerStats = await getEngineerLeaderboard();

  // Daily breakdown for latest week
  const latestWeek = weeks[0];
  let dailyBreakdown: { date: string; commits: number; engineers: number }[] = [];
  if (latestWeek) {
    dailyBreakdown = await db
      .select({
        date: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
        commits: sql<number>`count(*)`,
        engineers: sql<number>`count(distinct ${schema.commits.engineerId})`,
      })
      .from(schema.commits)
      .where(
        and(
          sql`${schema.commits.committedAt} >= ${new Date(`${latestWeek.start}T00:00:00Z`).getTime() / 1000}`,
          sql`${schema.commits.committedAt} <= ${new Date(`${latestWeek.end}T23:59:59Z`).getTime() / 1000}`
        )
      )
      .groupBy(sql`date(${schema.commits.committedAt}, 'unixepoch')`)
      .orderBy(desc(sql`date(${schema.commits.committedAt}, 'unixepoch')`));
  }

  // Repo activity (all time, cached)
  const repoActivity = await getRepoActivity();

  return (
    <div className="space-y-6">
      {/* Overall Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/commits">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Commits</CardTitle>
              <GitCommit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalCommits}</div>
              <p className="text-xs text-muted-foreground">Click to view details</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/engineers">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Engineers</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalEngineers}</div>
              <p className="text-xs text-muted-foreground">Click to view details</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/repos">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Repos</CardTitle>
              <FolderGit2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalRepos}</div>
              <p className="text-xs text-muted-foreground">Click to view details</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Weekly Overview + Engineer Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Weekly Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Weekly Overview
              </CardTitle>
              <CardDescription>Commits per week across all repos</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Commits</TableHead>
                    <TableHead className="text-right">Engineers</TableHead>
                    <TableHead className="text-right">Repos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeks.map((w) => (
                    <TableRow key={w.start} className="hover:bg-muted/50">
                      <TableCell className="font-mono font-medium">
                        <Link href={`/week/${w.start}`} className="hover:underline">
                          {w.weekLabel}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        <Link href={`/week/${w.start}`} className="hover:underline">
                          {w.start} → {w.end}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">{w.commits}</TableCell>
                      <TableCell className="text-right font-mono">{w.engineers}</TableCell>
                      <TableCell className="text-right font-mono">{w.repos}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Daily Breakdown for Latest Week */}
          {latestWeek && dailyBreakdown.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily Breakdown — {latestWeek.weekLabel}</CardTitle>
                <CardDescription>{latestWeek.start} → {latestWeek.end}</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Commits</TableHead>
                      <TableHead className="text-right">Engineers</TableHead>
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
                        <TableCell className="text-right font-mono font-bold">{d.commits}</TableCell>
                        <TableCell className="text-right font-mono">{d.engineers}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Engineer Leaderboard */}
          <Card>
            <CardHeader>
              <CardTitle>Engineer Leaderboard</CardTitle>
              <CardDescription>All-time commits</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {engineerStats.map((a, i) => (
                  <div key={a.username} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-muted-foreground w-5">{i + 1}</span>
                      <Link
                        href={`/engineer/${a.username}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {a.displayName || a.username}
                      </Link>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-bold">{a.commits}</span>
                      <div className="text-xs text-muted-foreground font-mono">
                        <span className="text-emerald-600">+{a.linesAdded}</span>
                        {" / "}
                        <span className="text-red-600">-{a.linesDeleted}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Repo Activity */}
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
                  <div key={r.name} className="flex items-center justify-between">
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
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
