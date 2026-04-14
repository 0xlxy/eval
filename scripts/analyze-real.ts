import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { runFullAnalysis } from "../src/lib/claude/analyze";
import Database from "better-sqlite3";
import path from "path";

async function main() {
  const dbPath = path.join(process.cwd(), "data", "dev-eval.db");
  const sqlite = new Database(dbPath);

  // Find all dates that have commits but no analysis yet
  const dates = sqlite
    .prepare(
      `SELECT DISTINCT date(committed_at, 'unixepoch') as d
       FROM commits
       ORDER BY d DESC`
    )
    .all() as { d: string }[];

  console.log(`Found ${dates.length} dates with commits:`);
  dates.forEach((d) => console.log(`  - ${d.d}`));
  sqlite.close();

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
