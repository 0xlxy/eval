import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { isBotUsername, VENDORED_LINE_THRESHOLD } from "@/lib/filters";

export const dynamic = "force-dynamic";

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const includeBots = url.searchParams.get("includeBots") === "1";
  const includeVendored = url.searchParams.get("includeVendored") === "1";

  const vendoredFilter = includeVendored
    ? sql`1=1`
    : sql`${schema.commits.linesAdded} + ${schema.commits.linesDeleted} < ${VENDORED_LINE_THRESHOLD}`;

  const rows = await db
    .select({
      username: schema.engineers.username,
      displayName: schema.engineers.displayName,
      commits: sql<number>`count(*)`,
      linesAdded: sql<number>`coalesce(sum(${schema.commits.linesAdded}), 0)`,
      linesDeleted: sql<number>`coalesce(sum(${schema.commits.linesDeleted}), 0)`,
      filesChanged: sql<number>`coalesce(sum(${schema.commits.filesChanged}), 0)`,
      repos: sql<number>`count(distinct ${schema.commits.repoId})`,
      activeDays: sql<number>`count(distinct date(${schema.commits.committedAt}, 'unixepoch'))`,
    })
    .from(schema.commits)
    .innerJoin(
      schema.engineers,
      eq(schema.commits.engineerId, schema.engineers.id)
    )
    .where(and(vendoredFilter))
    .groupBy(schema.engineers.id)
    .orderBy(desc(sql`count(*)`));

  const filtered = includeBots
    ? rows
    : rows.filter((r) => !isBotUsername(r.username));

  const headers = [
    "username",
    "display_name",
    "commits",
    "lines_added",
    "lines_deleted",
    "files_changed",
    "repos",
    "active_days",
    "avg_lines_per_commit",
  ];
  const lines = [headers.join(",")];
  for (const r of filtered) {
    const avg = r.commits > 0 ? (r.linesAdded + r.linesDeleted) / r.commits : 0;
    lines.push(
      [
        r.username,
        r.displayName || "",
        r.commits,
        r.linesAdded,
        r.linesDeleted,
        r.filesChanged,
        r.repos,
        r.activeDays,
        avg.toFixed(1),
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="engineers-${date}.csv"`,
    },
  });
}
