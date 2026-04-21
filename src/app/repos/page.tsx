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
import { FolderGit2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReposPage() {
  // Per repo summary
  const repos = await db
    .select({
      name: schema.repos.name,
      language: schema.repos.language,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`coalesce(sum(${schema.commits.linesAdded}), 0)`,
      linesDeleted: sql<number>`coalesce(sum(${schema.commits.linesDeleted}), 0)`,
      engineers: sql<number>`count(distinct ${schema.commits.engineerId})`,
      lastCommit: sql<number>`max(${schema.commits.committedAt})`,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .groupBy(schema.repos.id)
    .orderBy(desc(sql`count(*)`));

  // Branch counts per repo
  const branches = await db
    .select({
      repoName: schema.repos.name,
      branchCount: sql<number>`count(distinct ${schema.commitBranches.branch})`,
    })
    .from(schema.commitBranches)
    .innerJoin(schema.commits, eq(schema.commitBranches.commitId, schema.commits.id))
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .groupBy(schema.repos.id);
  const branchCountByRepo = new Map(
    branches.map((b) => [b.repoName, b.branchCount])
  );

  // Top contributor per repo
  const topContribRows = await db
    .select({
      repoName: schema.repos.name,
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commits: sql<number>`count(*)`,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .innerJoin(schema.engineers, eq(schema.commits.engineerId, schema.engineers.id))
    .groupBy(schema.repos.id, schema.engineers.id);
  const topByRepo = new Map<
    string,
    { displayName: string; username: string; commits: number }
  >();
  for (const r of topContribRows) {
    const cur = topByRepo.get(r.repoName);
    if (!cur || r.commits > cur.commits) {
      topByRepo.set(r.repoName, {
        displayName: r.displayName || r.username,
        username: r.username,
        commits: r.commits,
      });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderGit2 className="h-6 w-6" />
          Repo Breakdown
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Activity per repository across all tracked branches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Repos</CardTitle>
          <CardDescription>Sorted by commit count</CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="table-fixed w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[25%]">Repo</TableHead>
                <TableHead className="w-[10%] text-right">Commits</TableHead>
                <TableHead className="w-[10%] text-right">Branches</TableHead>
                <TableHead className="w-[10%] text-right">Engineers</TableHead>
                <TableHead className="w-[15%] text-right">Lines</TableHead>
                <TableHead className="w-[15%]">Top Contributor</TableHead>
                <TableHead className="w-[15%]">Last Commit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {repos.map((r) => {
                const top = topByRepo.get(r.name);
                const lastDate = r.lastCommit
                  ? new Date(r.lastCommit * 1000).toISOString().slice(0, 10)
                  : "-";
                return (
                  <TableRow key={r.name}>
                    <TableCell>
                      <Link
                        href={`/repo/${r.name}`}
                        className="font-mono text-sm hover:underline"
                      >
                        {r.name}
                      </Link>
                      {r.language && (
                        <div className="text-xs text-muted-foreground">
                          {r.language}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {r.commits}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {branchCountByRepo.get(r.name) || 0}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.engineers}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                      <span className="text-emerald-600">+{r.linesAdded}</span>
                      {" / "}
                      <span className="text-red-600">-{r.linesDeleted}</span>
                    </TableCell>
                    <TableCell>
                      {top ? (
                        <Link
                          href={`/engineer/${top.username}`}
                          className="text-sm hover:underline"
                        >
                          {top.displayName}
                          <span className="text-xs text-muted-foreground font-mono ml-1">
                            ({top.commits})
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{lastDate}</TableCell>
                  </TableRow>
                );
              })}
              {repos.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No repo activity
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
