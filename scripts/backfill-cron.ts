/**
 * Smart backfill script that tracks progress and respects rate limits.
 *
 * - Tracks fetched (date, repo, branch) in `fetch_log` table — never repeats work.
 * - Checks GitHub rate limit before each repo; stops when < 100 remaining.
 * - Memory-capped: run with `node --max-old-space-size=512`.
 * - Idempotent: safe to re-run as many times as needed.
 *
 * Usage:
 *   npx tsx scripts/backfill-cron.ts                     # defaults: 2026-01-01 → 2026-04-15
 *   npx tsx scripts/backfill-cron.ts 2026-03-01 2026-03-31  # custom range
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";
import { db, schema } from "../src/lib/db";
import { eq, and } from "drizzle-orm";

const ThrottledOctokit = Octokit.plugin(throttling);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const org = process.env.GITHUB_ORG || "Sofamon";
const maxBranches = Math.min(
  parseInt(process.env.FETCH_MAX_BRANCHES_PER_REPO || "50"),
  500
);

// Only fetch actively developed repos — keeps API usage under 5k/hour
const TARGET_REPOS = [
  "wishwish-unity-v2",
  "wishwish-ios",
  "wishwish-contracts",
  "wishwish-pc",
  "wishwish-backend-mono",
  "wishwish-backend-v2",
];

function createOctokit() {
  return new ThrottledOctokit({
    auth: process.env.GH_PAT || process.env.GITHUB_TOKEN,
    throttle: {
      onRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
        console.warn(`  Rate limit hit for ${options.method} ${options.url}, wait ${retryAfter}s`);
        return false;
      },
      onSecondaryRateLimit: (_retryAfter: number, options: Record<string, unknown>) => {
        console.warn(`  Secondary rate limit for ${options.method} ${options.url}`);
        return false;
      },
    },
  });
}

interface RateInfo {
  remaining: number;
  resetAt: Date;
}

async function checkRateLimit(octokit: InstanceType<typeof ThrottledOctokit>): Promise<RateInfo> {
  const { data } = await octokit.rateLimit.get();
  return {
    remaining: data.rate.remaining,
    resetAt: new Date(data.rate.reset * 1000),
  };
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRecentDate(date: string): boolean {
  // Always re-fetch today and yesterday — commits pushed after the previous
  // run would otherwise be skipped forever because of the fetch_log entry.
  const today = todayUTC();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return date === today || date === yesterday;
}

async function isFetched(date: string, repoName: string, branch: string): Promise<boolean> {
  if (isRecentDate(date)) return false;
  const row = await db.query.fetchLog.findFirst({
    where: and(
      eq(schema.fetchLog.date, date),
      eq(schema.fetchLog.repoName, repoName),
      eq(schema.fetchLog.branch, branch)
    ),
  });
  return !!row;
}

async function markFetched(date: string, repoName: string, branch: string, commitsFetched: number) {
  // For recent dates (today/yesterday), update the existing row so commits_fetched reflects the latest count.
  if (isRecentDate(date)) {
    const existing = await db.query.fetchLog.findFirst({
      where: and(
        eq(schema.fetchLog.date, date),
        eq(schema.fetchLog.repoName, repoName),
        eq(schema.fetchLog.branch, branch)
      ),
    });
    if (existing) {
      await db
        .update(schema.fetchLog)
        .set({ commitsFetched, fetchedAt: new Date() })
        .where(eq(schema.fetchLog.id, existing.id));
      return;
    }
  }
  await db
    .insert(schema.fetchLog)
    .values({ date, repoName, branch, commitsFetched })
    .onConflictDoNothing();
}

async function fetchBranchCommits(
  octokit: InstanceType<typeof ThrottledOctokit>,
  repoName: string,
  repoId: number,
  branch: string,
  date: string
): Promise<number> {
  const startOfDay = new Date(`${date}T00:00:00Z`).toISOString();
  const endOfDay = new Date(`${date}T23:59:59Z`).toISOString();
  let newCommits = 0;

  let commitsResponse;
  try {
    commitsResponse = await octokit.repos.listCommits({
      owner: org,
      repo: repoName,
      sha: branch,
      since: startOfDay,
      until: endOfDay,
      per_page: 100,
    });
  } catch {
    return 0;
  }

  for (const commit of commitsResponse.data) {
    const authorKey =
      commit.author?.login ||
      commit.commit.author?.email ||
      commit.commit.author?.name;
    if (!authorKey) continue;

    // Upsert engineer
    let engineer = await db.query.engineers.findFirst({
      where: eq(schema.engineers.username, authorKey),
    });
    let engineerId: number;
    if (engineer) {
      engineerId = engineer.id;
    } else {
      const [inserted] = await db
        .insert(schema.engineers)
        .values({
          username: authorKey,
          displayName: commit.commit.author?.name || authorKey,
          avatarUrl: commit.author?.avatar_url || null,
        })
        .returning();
      engineerId = inserted.id;
    }

    // Check if commit already exists (by SHA)
    const existing = await db.query.commits.findFirst({
      where: eq(schema.commits.sha, commit.sha),
    });

    let commitId: number;
    if (existing) {
      commitId = existing.id;
    } else {
      // Fetch commit detail for line stats
      await sleep(80);
      let linesAdded = 0,
        linesDeleted = 0,
        filesChanged = 0;
      try {
        const detail = await octokit.repos.getCommit({
          owner: org,
          repo: repoName,
          ref: commit.sha,
        });
        linesAdded = detail.data.stats?.additions || 0;
        linesDeleted = detail.data.stats?.deletions || 0;
        filesChanged = detail.data.files?.length || 0;
      } catch {
        // skip detail
      }

      const [insertedCommit] = await db
        .insert(schema.commits)
        .values({
          sha: commit.sha,
          repoId,
          engineerId,
          message: commit.commit.message,
          linesAdded,
          linesDeleted,
          filesChanged,
          committedAt: new Date(
            commit.commit.committer?.date || commit.commit.author?.date || date
          ),
        })
        .returning({ id: schema.commits.id });

      commitId = insertedCommit.id;
      newCommits++;
    }

    // Record branch mapping
    await db
      .insert(schema.commitBranches)
      .values({ commitId, branch })
      .onConflictDoNothing();
  }

  return newCommits;
}

async function main() {
  const startDate = process.argv[2] || "2026-01-01";
  const endDate = process.argv[3] || "2026-04-15";
  const dates = dateRange(startDate, endDate);

  const octokit = createOctokit();

  // Check initial rate limit
  const initialRate = await checkRateLimit(octokit);
  console.log(`Rate limit: ${initialRate.remaining} remaining, resets at ${initialRate.resetAt.toLocaleTimeString()}`);
  if (initialRate.remaining < 100) {
    console.log(`Too few API calls remaining. Try again after ${initialRate.resetAt.toLocaleTimeString()}`);
    return;
  }

  // Use targeted repo list — no need to paginate all org repos
  const repos = TARGET_REPOS.map((name) => ({
    name,
    fullName: `${org}/${name}`,
    language: null as string | null,
    defaultBranch: "main",
  }));
  console.log(`Targeting ${repos.length} repos, ${dates.length} days to process\n`);

  // Cache branches per repo (they don't change day-to-day)
  const branchCache = new Map<string, string[]>();
  for (const repo of repos) {
    try {
      const branchList = await octokit.paginate(octokit.repos.listBranches, {
        owner: org,
        repo: repo.name,
        per_page: 100,
      });
      branchCache.set(repo.name, branchList.map((b) => b.name).slice(0, maxBranches));
    } catch {
      branchCache.set(repo.name, [repo.defaultBranch]);
    }
  }
  console.log(`Cached branches: ${[...branchCache.entries()].map(([r, b]) => `${r}(${b.length})`).join(", ")}\n`);

  let totalNewCommits = 0;
  let skippedCombos = 0;
  let stopped = false;

  for (const date of dates) {
    if (stopped) break;

    let dayCommits = 0;
    let daySkipped = 0;

    for (const repo of repos) {
      if (stopped) break;

      // Check rate limit every 5 repos
      if (repos.indexOf(repo) % 5 === 0) {
        const rate = await checkRateLimit(octokit);
        if (rate.remaining < 100) {
          console.log(`\n⚠ Rate limit low (${rate.remaining}). Stopping. Resets at ${rate.resetAt.toLocaleTimeString()}`);
          stopped = true;
          break;
        }
      }

      // Ensure repo exists in DB
      let dbRepo = await db.query.repos.findFirst({
        where: eq(schema.repos.name, repo.name),
      });
      let repoId: number;
      if (dbRepo) {
        repoId = dbRepo.id;
      } else {
        const [inserted] = await db
          .insert(schema.repos)
          .values({ name: repo.name, fullName: repo.fullName, language: repo.language })
          .returning();
        repoId = inserted.id;
      }

      // Use cached branches
      const branches = branchCache.get(repo.name) || [repo.defaultBranch];

      for (const branch of branches) {
        // Skip if already fetched
        if (await isFetched(date, repo.name, branch)) {
          daySkipped++;
          continue;
        }

        const commits = await fetchBranchCommits(octokit, repo.name, repoId, branch, date);
        await markFetched(date, repo.name, branch, commits);
        dayCommits += commits;
      }
    }

    skippedCombos += daySkipped;
    totalNewCommits += dayCommits;
    const rate = await checkRateLimit(octokit);
    console.log(
      `${date}: +${dayCommits} commits (${daySkipped} branches skipped) | API remaining: ${rate.remaining}`
    );
  }

  console.log(`\n--- Summary ---`);
  console.log(`New commits: ${totalNewCommits}`);
  console.log(`Skipped (already fetched): ${skippedCombos} branch-days`);
  if (stopped) {
    console.log(`Stopped early due to rate limit. Re-run to continue.`);
  } else {
    console.log(`All done!`);
  }
}

main().catch(console.error);
