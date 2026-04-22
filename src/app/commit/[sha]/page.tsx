import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GitBranch, GitCommit, ExternalLink, AlertTriangle } from "lucide-react";
import { isLikelyVendored } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function CommitPage({
  params,
}: {
  params: Promise<{ sha: string }>;
}) {
  const { sha } = await params;

  // Support partial SHA (e.g. 7-char prefix)
  const commit = await db
    .select({
      id: schema.commits.id,
      sha: schema.commits.sha,
      message: schema.commits.message,
      linesAdded: schema.commits.linesAdded,
      linesDeleted: schema.commits.linesDeleted,
      filesChanged: schema.commits.filesChanged,
      committedAt: schema.commits.committedAt,
      repoName: schema.repos.name,
      repoFullName: schema.repos.fullName,
      engineerUsername: schema.engineers.username,
      engineerDisplayName: schema.engineers.displayName,
    })
    .from(schema.commits)
    .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
    .innerJoin(
      schema.engineers,
      eq(schema.commits.engineerId, schema.engineers.id)
    )
    .where(sql`${schema.commits.sha} LIKE ${sha + "%"}`)
    .limit(1);

  if (commit.length === 0) notFound();
  const c = commit[0];

  // Branches this commit is reachable from
  const branches = await db
    .select({ branch: schema.commitBranches.branch })
    .from(schema.commitBranches)
    .where(eq(schema.commitBranches.commitId, c.id));

  const committedDate =
    c.committedAt instanceof Date
      ? c.committedAt.toISOString().slice(0, 19).replace("T", " ")
      : String(c.committedAt);
  const day = committedDate.slice(0, 10);
  const vendored = isLikelyVendored(c.linesAdded, c.linesDeleted);
  const githubUrl = `https://github.com/${c.repoFullName}/commit/${c.sha}`;

  // Split message into subject + body
  const [subject, ...bodyLines] = c.message.split("\n");
  const body = bodyLines.join("\n").trim();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href={`/repo/${c.repoName}`} className="hover:underline font-mono">
            {c.repoName}
          </Link>
          <span>·</span>
          <Link href={`/daily/${day}`} className="hover:underline font-mono">
            {day}
          </Link>
          <span>·</span>
          <Link
            href={`/engineer/${c.engineerUsername}`}
            className="hover:underline"
          >
            {c.engineerDisplayName || c.engineerUsername}
          </Link>
        </div>
        <h1 className="text-xl font-bold mt-2 break-words">{subject}</h1>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-xs text-muted-foreground">{c.sha}</code>
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            View on GitHub <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {vendored && (
        <Card className="border-amber-400">
          <CardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">
                Flagged as likely vendored / generated
              </p>
              <p className="text-muted-foreground mt-1">
                Total change is {c.linesAdded + c.linesDeleted} lines — commits
                this large are usually lockfile or generated-code bulk updates
                and are excluded from efficiency scoring by default.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <GitCommit className="h-3 w-3" /> Lines Added
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-emerald-600">
              +{c.linesAdded}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Lines Deleted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">
              -{c.linesDeleted}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Files Changed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{c.filesChanged}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Committed At</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm font-mono">{committedDate}</div>
          </CardContent>
        </Card>
      </div>

      {body && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Message</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap break-words font-mono leading-relaxed">
              {body}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitBranch className="h-4 w-4" />
            Reachable From
          </CardTitle>
          <CardDescription>
            Branches that include this commit at the time of last fetch
          </CardDescription>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No branch mapping recorded
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <span
                  key={b.branch}
                  className="inline-flex items-center px-2 py-1 rounded bg-muted font-mono text-xs"
                >
                  {b.branch}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
