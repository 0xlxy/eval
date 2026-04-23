import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * Invalidates all `commits`-tagged caches. Called by the backfill/analysis
 * cron after a successful run so the dashboard picks up new data without
 * waiting for the 5-min TTL.
 *
 * Auth: `secret` query param must match CRON_SECRET. The same secret is
 * already wired into the GitHub Actions workflow env.
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("commits", "max");
  return NextResponse.json({ revalidated: "commits", at: Date.now() });
}
