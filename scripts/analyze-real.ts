/**
 * Runs Claude AI analysis on every (engineer, date) that has commits but
 * no completed analysis yet. Safe to re-run — skips already-analyzed combos.
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { runFullAnalysis } from "../src/lib/claude/analyze";
import { db, schema } from "../src/lib/db";
import { sql, eq, and } from "drizzle-orm";

async function main() {
  const onlyNew = !process.argv.includes("--all");

  // Find all dates that have commits
  const dates = await db
    .selectDistinct({
      d: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
    })
    .from(schema.commits)
    .orderBy(sql`date(${schema.commits.committedAt}, 'unixepoch') DESC`);

  console.log(`Found ${dates.length} dates with commits`);

  let skipped = 0;
  let analyzed = 0;

  for (const { d } of dates) {
    // If onlyNew, skip dates where every active engineer already has an analysis
    if (onlyNew) {
      const dayStart = new Date(`${d}T00:00:00Z`).getTime() / 1000;
      const dayEnd = new Date(`${d}T23:59:59Z`).getTime() / 1000;

      const activeEngineers = await db
        .selectDistinct({ id: schema.commits.engineerId })
        .from(schema.commits)
        .where(
          and(
            sql`${schema.commits.committedAt} >= ${dayStart}`,
            sql`${schema.commits.committedAt} <= ${dayEnd}`
          )
        );

      const existingAnalyses = await db
        .select({ engineerId: schema.dailyAnalyses.engineerId })
        .from(schema.dailyAnalyses)
        .where(eq(schema.dailyAnalyses.date, d));

      const existingSet = new Set(existingAnalyses.map((a) => a.engineerId));
      const allDone = activeEngineers.every((e) => existingSet.has(e.id));

      if (allDone && activeEngineers.length > 0) {
        skipped++;
        continue;
      }
    }

    process.stdout.write(`Analyzing ${d}... `);
    try {
      const result = await runFullAnalysis(d);
      console.log(`✓ ${result.analyzedEngineers} engineers`);
      analyzed++;
    } catch (e) {
      console.log(`✗ ${e}`);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Analyzed: ${analyzed} dates`);
  console.log(`Skipped (already done): ${skipped} dates`);
}

main().catch(console.error);
