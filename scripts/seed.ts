import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/lib/db/schema";
import { format, subDays } from "date-fns";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });

const ENGINEERS = [
  { username: "alice-chen", displayName: "Alice Chen", avatarUrl: null },
  { username: "bob-smith", displayName: "Bob Smith", avatarUrl: null },
  { username: "carol-liu", displayName: "Carol Liu", avatarUrl: null },
  { username: "dave-wang", displayName: "Dave Wang", avatarUrl: null },
  { username: "eve-zhang", displayName: "Eve Zhang", avatarUrl: null },
];

const REPOS = [
  { name: "api-gateway", fullName: "myorg/api-gateway", language: "TypeScript" },
  { name: "web-app", fullName: "myorg/web-app", language: "TypeScript" },
  { name: "data-pipeline", fullName: "myorg/data-pipeline", language: "Python" },
  { name: "mobile-app", fullName: "myorg/mobile-app", language: "Swift" },
  { name: "infra-config", fullName: "myorg/infra-config", language: "HCL" },
];

const SUMMARIES = [
  "Implemented new authentication flow with JWT token refresh. Solid work covering both backend validation and frontend token management.",
  "Fixed critical database connection pooling issue. The fix addresses the production timeout errors reported this week.",
  "Refactored payment processing module for better error handling. Added comprehensive retry logic with exponential backoff.",
  "Added new user analytics dashboard with real-time charts. Integrated WebSocket for live data updates.",
  "Improved CI/CD pipeline performance by parallelizing test suites. Build times reduced by 40%.",
];

const SUGGESTIONS = [
  "Consider breaking down larger commits into smaller, more focused changes for easier review.",
  "Add more descriptive commit messages that explain the 'why' behind changes.",
  "Look into increasing test coverage for the new authentication endpoints.",
  "The refactored code could benefit from additional inline documentation for complex logic.",
  "Consider setting up automated performance benchmarks to track improvements over time.",
];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function seed() {
  console.log("Seeding database...");

  // Insert engineers
  for (const eng of ENGINEERS) {
    await db.insert(schema.engineers).values(eng).onConflictDoNothing().run();
  }
  const allEngineers = await db
    .select({ id: schema.engineers.id })
    .from(schema.engineers);
  const engineerIds = allEngineers.map((e) => e.id);

  // Insert repos
  for (const repo of REPOS) {
    await db.insert(schema.repos).values(repo).onConflictDoNothing().run();
  }
  const allRepos = await db
    .select({ id: schema.repos.id })
    .from(schema.repos);
  const repoIds = allRepos.map((r) => r.id);

  // Generate 30 days of data
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const date = format(subDays(new Date(), dayOffset), "yyyy-MM-dd");
    const isWeekend =
      subDays(new Date(), dayOffset).getDay() === 0 ||
      subDays(new Date(), dayOffset).getDay() === 6;

    // Fewer active engineers on weekends
    const activeCount = isWeekend ? randomInt(0, 2) : randomInt(3, 5);
    const activeEngineers = [...engineerIds]
      .sort(() => Math.random() - 0.5)
      .slice(0, activeCount);

    let totalCommits = 0;
    let totalPrsMerged = 0;

    for (const engId of activeEngineers) {
      const commitCount = randomInt(1, 8);
      let engLinesAdded = 0;
      let engLinesDeleted = 0;
      let engFilesChanged = 0;

      for (let c = 0; c < commitCount; c++) {
        const repoId = randomItem(repoIds);
        const linesAdded = randomInt(5, 200);
        const linesDeleted = randomInt(0, 80);
        const filesChanged = randomInt(1, 10);
        engLinesAdded += linesAdded;
        engLinesDeleted += linesDeleted;
        engFilesChanged += filesChanged;

        const sha = `${date.replace(/-/g, "")}${engId}${c}${Math.random().toString(36).substring(2, 8)}`;
        const messages = [
          "feat: add user authentication endpoint",
          "fix: resolve database connection timeout",
          "refactor: clean up payment processing logic",
          "feat: implement real-time notifications",
          "fix: handle edge case in data validation",
          "chore: update dependencies",
          "feat: add search functionality",
          "fix: correct timezone handling in reports",
          "refactor: extract shared utilities",
          "test: add integration tests for API",
        ];

        await db.insert(schema.commits)
          .values({
            sha,
            repoId,
            engineerId: engId,
            message: randomItem(messages),
            linesAdded,
            linesDeleted,
            filesChanged,
            committedAt: new Date(`${date}T${String(randomInt(9, 18)).padStart(2, "0")}:${String(randomInt(0, 59)).padStart(2, "0")}:00Z`),
          })
          .onConflictDoNothing()
          .run();

        totalCommits++;
      }

      // Some engineers open/merge PRs
      if (Math.random() > 0.4) {
        const prState = Math.random() > 0.3 ? "merged" : "open";
        const prTitles = [
          "Add JWT authentication middleware",
          "Fix connection pool exhaustion",
          "Refactor payment error handling",
          "Implement WebSocket notifications",
          "Update CI pipeline configuration",
        ];
        await db.insert(schema.pullRequests)
          .values({
            githubId: randomInt(1000, 99999),
            repoId: randomItem(repoIds),
            engineerId: engId,
            title: randomItem(prTitles),
            state: prState,
            additions: engLinesAdded,
            deletions: engLinesDeleted,
            reviewComments: randomInt(0, 12),
            createdAtGh: new Date(`${date}T10:00:00Z`),
            mergedAt: prState === "merged" ? new Date(`${date}T16:00:00Z`) : null,
          })
          .onConflictDoNothing()
          .run();

        if (prState === "merged") totalPrsMerged++;
      }

      // Create daily analysis
      const score = randomInt(40, 95);
      await db.insert(schema.dailyAnalyses)
        .values({
          engineerId: engId,
          date,
          commitCount,
          totalLinesAdded: engLinesAdded,
          totalLinesDeleted: engLinesDeleted,
          totalFilesChanged: engFilesChanged,
          prsMerged: totalPrsMerged > 0 ? 1 : 0,
          prsOpened: 1,
          workSummary: randomItem(SUMMARIES),
          qualityAssessment:
            score > 70
              ? "Good code quality with clear commit messages and well-structured changes."
              : "Adequate work, but could benefit from more atomic commits and clearer documentation.",
          efficiencyScore: score,
          suggestions: randomItem(SUGGESTIONS),
          highlights:
            score > 80
              ? "Excellent contribution with clean, well-tested code."
              : null,
        })
        .onConflictDoNothing()
        .run();
    }

    // Create org summary
    if (activeEngineers.length > 0) {
      await db.insert(schema.dailyOrgSummaries)
        .values({
          date,
          totalCommits,
          totalPrsMerged,
          activeEngineers: activeEngineers.length,
          activeRepos: randomInt(2, 5),
          orgSummary: `The team had a ${activeEngineers.length > 3 ? "productive" : "moderate"} day with ${totalCommits} commits across multiple repositories. Key focus areas included feature development and bug fixes. ${totalPrsMerged > 0 ? `${totalPrsMerged} PRs were merged, moving the project forward.` : ""}`,
          topContributors: JSON.stringify(
            ENGINEERS.slice(0, Math.min(3, activeEngineers.length)).map(
              (e) => e.username
            )
          ),
        })
        .onConflictDoNothing()
        .run();
    }
  }

  console.log("Seed complete!");
}

seed().catch(console.error);
