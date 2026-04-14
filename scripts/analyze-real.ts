import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { runFullAnalysis } from "../src/lib/claude/analyze";
import { db, schema } from "../src/lib/db";
import { sql } from "drizzle-orm";

async function main() {
  // Find all dates that have commits
  const dates = await db
    .selectDistinct({
      d: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
    })
    .from(schema.commits)
    .orderBy(sql`date(${schema.commits.committedAt}, 'unixepoch') DESC`);

  console.log(`Found ${dates.length} dates with commits:`);
  dates.forEach((d) => console.log(`  - ${d.d}`));

  for (const { d } of dates) {
    console.log(`\nAnalyzing ${d}...`);
    try {
      const result = await runFullAnalysis(d);
      console.log(`  -> Analyzed ${result.analyzedEngineers} engineers`);
    } catch (e) {
      console.error(`  -> Error: ${e}`);
    }
  }

  console.log("\nDone!");
}

main().catch(console.error);
