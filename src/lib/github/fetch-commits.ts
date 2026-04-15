import { createGitHubClient, githubOrg } from "./client";
import { db, schema } from "../db";
import { eq } from "drizzle-orm";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FetchResult {
  repos: number;
  commits: number;
  prs: number;
  engineers: number;
}

type OrgRepo = {
  name: string;
  full_name: string;
  language: string | null;
  default_branch?: string;
};

function getBranchMode(): "all" | "default" {
  const v = (process.env.FETCH_BRANCH_MODE || "all").toLowerCase();
  return v === "default" ? "default" : "all";
}

function getMaxBranchesPerRepo(): number {
  const raw = process.env.FETCH_MAX_BRANCHES_PER_REPO;
  const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(n, 500);
}

function getMaxRepos(): number | null {
  const raw = process.env.FETCH_MAX_REPOS;
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 5000);
}

function getIncludePrs(): boolean {
  const raw = (process.env.FETCH_INCLUDE_PRS || "true").toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "no";
}

async function upsertCommitBranch(commitId: number, branch: string) {
  await db
    .insert(schema.commitBranches)
    .values({ commitId, branch })
    .onConflictDoNothing();
}

export async function listOrgRepos(): Promise<OrgRepo[]> {
  const octokit = createGitHubClient();
  const org = githubOrg();
  const reposResponse = await octokit.paginate(octokit.repos.listForOrg, {
    org,
    type: "all",
    per_page: 100,
  });
  return reposResponse.map((r) => ({
    name: r.name,
    full_name: r.full_name,
    language: r.language || null,
    default_branch: (r as { default_branch?: string }).default_branch,
  }));
}

export async function fetchDailyDataForRepos(
  date: string,
  repos: OrgRepo[]
): Promise<FetchResult> {
  const octokit = createGitHubClient();
  const org = githubOrg();
  const branchMode = getBranchMode();
  const maxBranchesPerRepo = getMaxBranchesPerRepo();
  const includePrs = getIncludePrs();

  const startOfDay = new Date(`${date}T00:00:00Z`).toISOString();
  const endOfDay = new Date(`${date}T23:59:59Z`).toISOString();

  let totalCommits = 0;
  let totalPrs = 0;
  const engineerSet = new Set<string>();

  for (const repo of repos) {
    // Upsert repo
    const existingRepo = await db.query.repos.findFirst({
      where: eq(schema.repos.name, repo.name),
    });
    let repoId: number;
    if (existingRepo) {
      repoId = existingRepo.id;
    } else {
      const [inserted] = await db
        .insert(schema.repos)
        .values({
          name: repo.name,
          fullName: repo.full_name,
          language: repo.language,
        })
        .returning();
      repoId = inserted.id;
    }

    // Step 2: Fetch commits for the day (per branch)
    try {
      // List branches first; if it fails (permissions / empty), fallback to default behavior.
      let branches: string[] = [];
      if (branchMode === "all") {
        try {
          const branchesResponse = await octokit.paginate(
            octokit.repos.listBranches,
            {
              owner: org,
              repo: repo.name,
              per_page: 100,
            }
          );
          branches = branchesResponse
            .map((b) => b.name)
            .slice(0, maxBranchesPerRepo);
        } catch {
          branches = [];
        }
      }

      // If branch listing fails, still fetch from default branch so pipeline remains useful.
      const branchesToFetch =
        branches.length > 0
          ? branches
          : [repo.default_branch || ""].filter(Boolean);

      for (const branch of branchesToFetch) {
        let commitsResponse;
        try {
          commitsResponse = await octokit.repos.listCommits({
            owner: org,
            repo: repo.name,
            sha: branch,
            since: startOfDay,
            until: endOfDay,
            per_page: 100,
          });
        } catch {
          continue;
        }

        for (const commit of commitsResponse.data) {
          const authorKey =
            commit.author?.login ||
            commit.commit.author?.email ||
            commit.commit.author?.name;
          if (!authorKey) continue;

          engineerSet.add(authorKey);

          // Upsert engineer
          const existingEngineer = await db.query.engineers.findFirst({
            where: eq(schema.engineers.username, authorKey),
          });
          let engineerId: number;
          if (existingEngineer) {
            engineerId = existingEngineer.id;
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

          // Upsert commit detail once (sha is unique)
          const existingCommit = await db.query.commits.findFirst({
            where: eq(schema.commits.sha, commit.sha),
          });

          let commitId: number;
          if (existingCommit) {
            commitId = existingCommit.id;
          } else {
            // Fetch commit detail for lines added/deleted
            await sleep(100); // Rate limit protection
            let linesAdded = 0;
            let linesDeleted = 0;
            let filesChanged = 0;
            try {
              const detail = await octokit.repos.getCommit({
                owner: org,
                repo: repo.name,
                ref: commit.sha,
              });
              linesAdded = detail.data.stats?.additions || 0;
              linesDeleted = detail.data.stats?.deletions || 0;
              filesChanged = detail.data.files?.length || 0;
            } catch {
              // Skip detail if fetch fails
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
                  commit.commit.committer?.date ||
                    commit.commit.author?.date ||
                    date
                ),
              })
              .returning({ id: schema.commits.id });

            commitId = insertedCommit.id;
            totalCommits++;
          }

          // Always record the commit<->branch mapping
          await upsertCommitBranch(commitId, branch);
        }
      }
    } catch {
      // Skip repo if listing commits fails (e.g., empty repo)
    }

    // Step 3: Fetch PRs
    if (!includePrs) continue;
    try {
      const prsResponse = await octokit.pulls.list({
        owner: org,
        repo: repo.name,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 100,
      });

      for (const pr of prsResponse.data) {
        const updatedAt = new Date(pr.updated_at);
        const dayStart = new Date(startOfDay);
        const dayEnd = new Date(endOfDay);
        if (updatedAt < dayStart || updatedAt > dayEnd) continue;

        const authorLogin = pr.user?.login;
        if (!authorLogin) continue;

        engineerSet.add(authorLogin);

        const existingEngineer = await db.query.engineers.findFirst({
          where: eq(schema.engineers.username, authorLogin),
        });
        let engineerId: number;
        if (existingEngineer) {
          engineerId = existingEngineer.id;
        } else {
          const [inserted] = await db
            .insert(schema.engineers)
            .values({
              username: authorLogin,
              displayName: authorLogin,
              avatarUrl: pr.user?.avatar_url || null,
            })
            .returning();
          engineerId = inserted.id;
        }

        // Check if PR already exists
        const existingPr = await db.query.pullRequests.findFirst({
          where: eq(schema.pullRequests.githubId, pr.number),
        });
        if (existingPr) continue;

        const state = pr.merged_at ? "merged" : pr.state;

        await db.insert(schema.pullRequests).values({
          githubId: pr.number,
          repoId,
          engineerId,
          title: pr.title,
          state,
          additions: ((pr as Record<string, unknown>).additions as number) || 0,
          deletions: ((pr as Record<string, unknown>).deletions as number) || 0,
          reviewComments:
            ((pr as Record<string, unknown>).review_comments as number) || 0,
          createdAtGh: new Date(pr.created_at),
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        });
        totalPrs++;
      }
    } catch {
      // Skip if PR fetch fails
    }
  }

  return {
    repos: repos.length,
    commits: totalCommits,
    prs: totalPrs,
    engineers: engineerSet.size,
  };
}

export async function fetchDailyData(date: string): Promise<FetchResult> {
  const repos = await listOrgRepos();
  const maxRepos = getMaxRepos();
  const reposToProcess = maxRepos ? repos.slice(0, maxRepos) : repos;
  return fetchDailyDataForRepos(date, reposToProcess);
}
