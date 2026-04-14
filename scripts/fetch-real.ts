import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { fetchDailyData } from "../src/lib/github/fetch-commits";
import { format, subDays } from "date-fns";

async function main() {
  // Fetch last 30 days
  for (let i = 1; i <= 30; i++) {
    const date = format(subDays(new Date(), i), "yyyy-MM-dd");
    console.log(`\nFetching ${date}...`);
    try {
      const result = await fetchDailyData(date);
      console.log(
        `  -> ${result.repos} repos scanned, ${result.commits} new commits, ${result.prs} PRs, ${result.engineers} engineers`
      );
    } catch (e) {
      console.error(`  -> Error: ${e}`);
    }
  }
  console.log("\nDone!");
}

main().catch(console.error);
