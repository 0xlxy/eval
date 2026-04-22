import { db, schema } from "@/lib/db";
import { desc, sql, eq } from "drizzle-orm";
import Link from "next/link";
import {
  extractCommitTag,
  TAG_ORDER,
  TAG_COLORS,
  type CommitTag,
} from "@/lib/commit-tags";
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
import { GitCommit } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CommitsPage() {
  // Totals
  const totals = await db
    .select({
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`coalesce(sum(${schema.commits.linesAdded}), 0)`,
      linesDeleted: sql<number>`coalesce(sum(${schema.commits.linesDeleted}), 0)`,
      files: sql<number>`coalesce(sum(${schema.commits.filesChanged}), 0)`,
    })
    .from(schema.commits);

  // Per repo
  const byRepo = await db
    .select({
      name: schema.repos.name,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`coalesce(sum(${schema.commits.linesAdded}), 0)`,
      linesDeleted: sql<number>`coalesce(sum(${schema.commits.linesDeleted}), 0)`,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .groupBy(schema.repos.id)
    .orderBy(desc(sql`count(*)`));

  // Per engineer
  const byEngineer = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`coalesce(sum(${schema.commits.linesAdded}), 0)`,
      linesDeleted: sql<number>`coalesce(sum(${schema.commits.linesDeleted}), 0)`,
    })
    .from(schema.commits)
    .innerJoin(schema.engineers, eq(schema.commits.engineerId, schema.engineers.id))
    .groupBy(schema.engineers.id)
    .orderBy(desc(sql`count(*)`));

  // Per week
  const byWeek = await db
    .select({
      date: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
      commits: sql<number>`count(*)`,
    })
    .from(schema.commits)
    .groupBy(sql`date(${schema.commits.committedAt}, 'unixepoch')`);

  // Tag breakdown — parsed client-side from commit messages
  const allMessages = await db
    .select({ message: schema.commits.message })
    .from(schema.commits);
  const tagCounts = new Map<CommitTag, number>();
  for (const row of allMessages) {
    const tag = extractCommitTag(row.message);
    tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  const tagStats = TAG_ORDER.map((tag) => ({
    tag,
    count: tagCounts.get(tag) || 0,
  })).filter((t) => t.count > 0);
  const totalTagged = tagStats.reduce((s, t) => s + t.count, 0);

  const weekMap = new Map<string, number>();
  for (const d of byWeek) {
    const date = new Date(`${d.date}T00:00:00Z`);
    const day = date.getUTCDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const mon = new Date(date);
    mon.setUTCDate(date.getUTCDate() + diffToMon);
    const monStr = mon.toISOString().slice(0, 10);
    weekMap.set(monStr, (weekMap.get(monStr) || 0) + d.commits);
  }
  const weeklyStats = [...weekMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([start, commits]) => {
      const end = new Date(`${start}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start, end: end.toISOString().slice(0, 10), commits };
    });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GitCommit className="h-6 w-6" />
          Commit Breakdown
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          All commits across target repos. Jan 1 – Apr 15, 2026.
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Total Commits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totals[0]?.commits || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Lines Added</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-600">
              +{totals[0]?.linesAdded || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Lines Deleted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">
              -{totals[0]?.linesDeleted || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Files Changed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{totals[0]?.files || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* By Type (conventional commits) */}
      <Card>
        <CardHeader>
          <CardTitle>By Type</CardTitle>
          <CardDescription>
            Commit message prefix (conventional commits). Uncategorized are
            grouped as &quot;other&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Stacked bar */}
          <div className="h-3 w-full rounded overflow-hidden flex border">
            {tagStats.map((t) => (
              <div
                key={t.tag}
                className={TAG_COLORS[t.tag].split(" ")[0]}
                style={{ width: `${(t.count / totalTagged) * 100}%` }}
                title={`${t.tag}: ${t.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {tagStats.map((t) => (
              <span
                key={t.tag}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${TAG_COLORS[t.tag]}`}
              >
                <span className="font-mono font-medium">{t.tag}</span>
                <span className="font-mono">{t.count}</span>
                <span className="opacity-70">
                  ({Math.round((t.count / totalTagged) * 100)}%)
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* By Repo */}
      <Card>
        <CardHeader>
          <CardTitle>By Repo</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Repo</TableHead>
                <TableHead className="w-[20%] text-right">Commits</TableHead>
                <TableHead className="w-[20%] text-right">Added</TableHead>
                <TableHead className="w-[20%] text-right">Deleted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byRepo.map((r) => (
                <TableRow key={r.name}>
                  <TableCell>
                    <Link href={`/repo/${r.name}`} className="font-mono hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {r.commits}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">
                    +{r.linesAdded}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{r.linesDeleted}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By Engineer */}
      <Card>
        <CardHeader>
          <CardTitle>By Engineer</CardTitle>
          <CardDescription>Sorted by commit count</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Engineer</TableHead>
                <TableHead className="w-[20%] text-right">Commits</TableHead>
                <TableHead className="w-[20%] text-right">Added</TableHead>
                <TableHead className="w-[20%] text-right">Deleted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byEngineer.map((e) => (
                <TableRow key={e.username}>
                  <TableCell>
                    <Link
                      href={`/engineer/${e.username}`}
                      className="font-medium hover:underline"
                    >
                      {e.displayName || e.username}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {e.commits}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">
                    +{e.linesAdded}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{e.linesDeleted}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* By Week */}
      <Card>
        <CardHeader>
          <CardTitle>By Week</CardTitle>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60%]">Week</TableHead>
                <TableHead className="w-[40%] text-right">Commits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeklyStats.map((w) => (
                <TableRow key={w.start}>
                  <TableCell>
                    <Link href={`/week/${w.start}`} className="font-mono hover:underline">
                      {w.start} → {w.end}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono font-bold">
                    {w.commits}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
