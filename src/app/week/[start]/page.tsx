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
  // Fixed repo order so column positions never shift between weeks.
  const TARGET_REPOS = [
    "wishwish-unity-v2",
    "wishwish-ios",
    "wishwish-contracts",
    "wishwish-pc",
    "wishwish-backend-mono",
    "wishwish-backend-v2",
  ];
  const reposList = TARGET_REPOS;
  // Silence unused-var lint — we intentionally ignore what repos actually had activity.
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

      {/* Engineer × Repo Contribution Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Contribution Matrix</CardTitle>
          <CardDescription>
            Commits per engineer per repo. Tap an engineer or repo to see details.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[18%] sticky left-0 bg-background">Engineer</TableHead>
                {reposList.map((r) => (
                  <TableHead key={r} className="w-[13%] text-right">
                    <Link href={`/repo/${r}`} className="hover:underline truncate block">
                      {r}
                    </Link>
                  </TableHead>
                ))}
                <TableHead className="w-[17%] text-right font-bold">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {engineers.map(([username, info]) => (
                <TableRow key={username}>
                  <TableCell className="sticky left-0 bg-background font-medium">
                    <Link href={`/engineer/${username}`} className="hover:underline">
                      {info.displayName}
                    </Link>
                    <div className="text-xs text-muted-foreground font-mono font-normal">
                      <span className="text-emerald-600">+{info.linesAdded}</span>
                      {" / "}
                      <span className="text-red-600">-{info.linesDeleted}</span>
                    </div>
                  </TableCell>
                  {reposList.map((r) => {
                    const cell = info.repos.get(r);
                    return (
                      <TableCell key={r} className="text-right font-mono">
                        {cell ? (
                          <div>
                            <div className="font-bold">{cell.commits}</div>
                            <div className="text-xs text-muted-foreground">
                              <span className="text-emerald-600">+{cell.linesAdded}</span>
                              {" / "}
                              <span className="text-red-600">-{cell.linesDeleted}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-right font-mono font-bold">
                    {info.total}
                  </TableCell>
                </TableRow>
              ))}
              {engineers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={reposList.length + 2} className="text-center text-muted-foreground">
                    No contributions this week
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
