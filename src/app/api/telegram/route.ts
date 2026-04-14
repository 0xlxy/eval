import { NextRequest, NextResponse } from "next/server";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { formatDailyReport } from "@/lib/telegram/format";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { format, subDays } from "date-fns";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  const date = dateParam || format(subDays(new Date(), 1), "yyyy-MM-dd");

  const orgSummary = await db.query.dailyOrgSummaries.findFirst({
    where: eq(schema.dailyOrgSummaries.date, date),
  });

  if (!orgSummary) {
    return NextResponse.json(
      { error: "No data for this date" },
      { status: 404 }
    );
  }

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

  const topContributors: string[] = orgSummary.topContributors
    ? JSON.parse(orgSummary.topContributors)
    : [];

  const message = formatDailyReport({
    date,
    orgSummary: orgSummary.orgSummary || "",
    totalCommits: orgSummary.totalCommits,
    totalPrsMerged: orgSummary.totalPrsMerged,
    activeEngineers: orgSummary.activeEngineers,
    activeRepos: orgSummary.activeRepos,
    topContributors,
    engineers: analyses.map((a) => ({
      username: a.username,
      displayName: a.displayName || a.username,
      commitCount: a.commitCount,
      efficiencyScore: a.efficiencyScore || 0,
      workSummary: a.workSummary || "",
    })),
  });

  const sent = await sendTelegramMessage(message);

  return NextResponse.json({ success: sent, date });
}
