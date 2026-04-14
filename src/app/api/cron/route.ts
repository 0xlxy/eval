import { NextRequest, NextResponse } from "next/server";
import { fetchDailyData } from "@/lib/github/fetch-commits";
import { runFullAnalysis } from "@/lib/claude/analyze";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { formatDailyReport } from "@/lib/telegram/format";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { format, subDays } from "date-fns";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Default to yesterday if no date provided
  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam || format(subDays(new Date(), 1), "yyyy-MM-dd");

  try {
    // Step 1: Fetch GitHub data
    const fetchResult = await fetchDailyData(date);
    console.log(`Fetched: ${fetchResult.commits} commits, ${fetchResult.prs} PRs`);

    // Step 2: Run Claude analysis
    const analysisResult = await runFullAnalysis(date);
    console.log(`Analyzed: ${analysisResult.analyzedEngineers} engineers`);

    // Step 3: Send Telegram notification
    const orgSummary = await db.query.dailyOrgSummaries.findFirst({
      where: eq(schema.dailyOrgSummaries.date, date),
    });

    const analyses = await db
      .select({
        username: schema.engineers.username,
        displayName: schema.engineers.displayName,
        commitCount: schema.dailyAnalyses.commitCount,
        efficiencyScore: schema.dailyAnalyses.efficiencyScore,
        workSummary: schema.dailyAnalyses.workSummary,
      })
      .from(schema.dailyAnalyses)
      .innerJoin(
        schema.engineers,
        eq(schema.dailyAnalyses.engineerId, schema.engineers.id)
      )
      .where(eq(schema.dailyAnalyses.date, date));

    const topContributors: string[] = orgSummary?.topContributors
      ? JSON.parse(orgSummary.topContributors)
      : [];

    const message = formatDailyReport({
      date,
      orgSummary: orgSummary?.orgSummary || "No summary available",
      totalCommits: orgSummary?.totalCommits || 0,
      totalPrsMerged: orgSummary?.totalPrsMerged || 0,
      activeEngineers: orgSummary?.activeEngineers || 0,
      activeRepos: orgSummary?.activeRepos || 0,
      topContributors,
      engineers: analyses.map((a) => ({
        username: a.username,
        displayName: a.displayName || a.username,
        commitCount: a.commitCount,
        efficiencyScore: a.efficiencyScore || 0,
        workSummary: a.workSummary || "",
      })),
    });

    await sendTelegramMessage(message);

    return NextResponse.json({
      success: true,
      date,
      fetch: fetchResult,
      analysis: analysisResult,
    });
  } catch (error) {
    console.error("Cron job failed:", error);
    return NextResponse.json(
      { error: "Pipeline failed", details: String(error) },
      { status: 500 }
    );
  }
}
