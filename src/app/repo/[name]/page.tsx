import { db, schema } from "@/lib/db";
import { eq, desc, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import { GitCommit, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function RepoPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;

  const repo = await db.query.repos.findFirst({
    where: eq(schema.repos.name, name),
  });

  if (!repo) notFound();

  // Contributor breakdown
  const contributors = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`sum(${schema.commits.linesAdded})`,
      linesDeleted: sql<number>`sum(${schema.commits.linesDeleted})`,
    })
    .from(schema.commits)
    .innerJoin(
      schema.engineers,
      eq(schema.commits.engineerId, schema.engineers.id)
    )
    .where(eq(schema.commits.repoId, repo.id))
    .groupBy(schema.engineers.username, schema.engineers.displayName)
    .orderBy(desc(sql`count(*)`));

  // Recent commits
  const recentCommits = await db
    .select({
      sha: schema.commits.sha,
      message: schema.commits.message,
      linesAdded: schema.commits.linesAdded,
      linesDeleted: schema.commits.linesDeleted,
      committedAt: schema.commits.committedAt,
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
    })
    .from(schema.commits)
    .innerJoin(
      schema.engineers,
      eq(schema.commits.engineerId, schema.engineers.id)
    )
    .where(eq(schema.commits.repoId, repo.id))
    .orderBy(desc(schema.commits.committedAt))
    .limit(30);

  // Branch breakdown (commits reachable from each branch)
  const branches = await db
    .select({
      branch: schema.commitBranches.branch,
      commits: sql<number>`count(*)`,
    })
    .from(schema.commitBranches)
    .innerJoin(schema.commits, eq(schema.commitBranches.commitId, schema.commits.id))
    .where(eq(schema.commits.repoId, repo.id))
    .groupBy(schema.commitBranches.branch)
    .orderBy(desc(sql`count(*)`))
    .limit(20);

  const totalCommits = contributors.reduce((s, c) => s + c.commits, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{repo.fullName}</h1>
        {repo.language && <Badge variant="outline">{repo.language}</Badge>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <GitCommit className="h-4 w-4" /> Total Commits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCommits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" /> Contributors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contributors.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Contributors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Contributors</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Engineer</TableHead>
                <TableHead className="text-right">Commits</TableHead>
                <TableHead className="text-right">Lines Added</TableHead>
                <TableHead className="text-right">Lines Deleted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contributors.map((c) => (
                <TableRow key={c.username}>
                  <TableCell>
                    <Link
                      href={`/engineer/${c.username}`}
                      className="font-medium hover:underline"
                    >
                      {c.displayName || c.username}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {c.commits}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-600">
                    +{c.linesAdded}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600">
                    -{c.linesDeleted}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Branches */}
      <Card>
        <CardHeader>
          <CardTitle>Branches</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Commits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((b) => (
                <TableRow key={b.branch}>
                  <TableCell className="font-mono text-sm">{b.branch}</TableCell>
                  <TableCell className="text-right font-mono">{b.commits}</TableCell>
                </TableRow>
              ))}
              {branches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    No branch data
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Commits */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Commits</CardTitle>
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
                    <Link
                      href={`/engineer/${c.username}`}
                      className="hover:underline"
                    >
                      {c.displayName || c.username}
                    </Link>{" "}
                    &middot;{" "}
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
