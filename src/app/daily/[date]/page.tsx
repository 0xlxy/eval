import { db, schema } from "@/lib/db";
import { eq, desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScoreBadge } from "@/components/score-badge";
import { KeyboardNav } from "@/components/keyboard-nav";
import { Brain, GitCommit, Users, GitPullRequest } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DailyPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = await params;

  const orgSummary = await db.query.dailyOrgSummaries.findFirst({
    where: eq(schema.dailyOrgSummaries.date, date),
  });

  if (!orgSummary) notFound();

  const analyses = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commitCount: schema.dailyAnalyses.commitCount,
      totalLinesAdded: schema.dailyAnalyses.totalLinesAdded,
      totalLinesDeleted: schema.dailyAnalyses.totalLinesDeleted,
      efficiencyScore: schema.dailyAnalyses.efficiencyScore,
      workSummary: schema.dailyAnalyses.workSummary,
      qualityAssessment: schema.dailyAnalyses.qualityAssessment,
      suggestions: schema.dailyAnalyses.suggestions,
      highlights: schema.dailyAnalyses.highlights,
    })
    .from(schema.dailyAnalyses)
    .innerJoin(
      schema.engineers,
      eq(schema.dailyAnalyses.engineerId, schema.engineers.id)
    )
    .where(eq(schema.dailyAnalyses.date, date))
    .orderBy(desc(schema.dailyAnalyses.efficiencyScore));

  // Adjacent dates for navigation
  const allDates = await db
    .select({ date: schema.dailyOrgSummaries.date })
    .from(schema.dailyOrgSummaries)
    .orderBy(desc(schema.dailyOrgSummaries.date));

  const currentIdx = allDates.findIndex((d) => d.date === date);
  const prevDate = currentIdx < allDates.length - 1 ? allDates[currentIdx + 1]?.date : null;
  const nextDate = currentIdx > 0 ? allDates[currentIdx - 1]?.date : null;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <KeyboardNav
        prevHref={prevDate ? `/daily/${prevDate}` : null}
        nextHref={nextDate ? `/daily/${nextDate}` : null}
      />
      {/* Navigation */}
      <div className="flex items-center justify-between">
        {prevDate ? (
          <Link href={`/daily/${prevDate}`} className="text-sm text-primary hover:underline">
            &larr; {prevDate}
          </Link>
        ) : (
          <span />
        )}
        <div className="text-center">
          <h1 className="text-xl font-bold">Daily Report: {date}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Use <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">←</kbd>{" "}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">→</kbd> to
            navigate
          </p>
        </div>
        {nextDate ? (
          <Link href={`/daily/${nextDate}`} className="text-sm text-primary hover:underline">
            {nextDate} &rarr;
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <GitCommit className="h-3 w-3" /> Commits
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{orgSummary.totalCommits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <Users className="h-3 w-3" /> Engineers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{orgSummary.activeEngineers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-1">
              <GitPullRequest className="h-3 w-3" /> PRs Merged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{orgSummary.totalPrsMerged}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium">Active Repos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{orgSummary.activeRepos}</div>
          </CardContent>
        </Card>
      </div>

      {/* Org Summary */}
      {orgSummary.orgSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Team Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{orgSummary.orgSummary}</p>
          </CardContent>
        </Card>
      )}

      {/* Individual Engineer Reports */}
      <h2 className="text-lg font-semibold">Engineer Reports</h2>
      <div className="space-y-4">
        {analyses.map((a) => (
          <Card key={a.username}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    <Link
                      href={`/engineer/${a.username}`}
                      className="hover:underline"
                    >
                      {a.displayName || a.username}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {a.commitCount} commits &middot;{" "}
                    <span className="text-emerald-600">
                      +{a.totalLinesAdded}
                    </span>
                    /
                    <span className="text-red-600">
                      -{a.totalLinesDeleted}
                    </span>
                  </CardDescription>
                </div>
                <ScoreBadge score={a.efficiencyScore || 0} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {a.workSummary && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Work Summary
                  </p>
                  <p className="text-sm">{a.workSummary}</p>
                </div>
              )}
              {a.qualityAssessment && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Quality
                  </p>
                  <p className="text-sm">{a.qualityAssessment}</p>
                </div>
              )}
              {a.suggestions && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Suggestions
                  </p>
                  <p className="text-sm">{a.suggestions}</p>
                </div>
              )}
              {a.highlights && (
                <div className="p-2 bg-emerald-50 rounded-md">
                  <p className="text-sm text-emerald-800">{a.highlights}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
