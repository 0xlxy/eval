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

export async function fetchDailyData(date: string): Promise<FetchResult> {
  const octokit = createGitHubClient();
  const org = githubOrg();

  const startOfDay = new Date(`${date}T00:00:00Z`).toISOString();
  const endOfDay = new Date(`${date}T23:59:59Z`).toISOString();

  // Step 1: List all repos
  const reposResponse = await octokit.paginate(octokit.repos.listForOrg, {
    org,
    type: "all",
    per_page: 100,
  });

  let totalCommits = 0;
  let totalPrs = 0;
  const engineerSet = new Set<string>();

  for (const repo of reposResponse) {
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
          language: repo.language || null,
        })
        .returning();
      repoId = inserted.id;
    }

    // Step 2: Fetch commits for the day
    try {
      const commitsResponse = await octokit.repos.listCommits({
        owner: org,
        repo: repo.name,
        since: startOfDay,
        until: endOfDay,
        per_page: 100,
      });

      for (const commit of commitsResponse.data) {
        const authorLogin = commit.author?.login;
        if (!authorLogin) continue;

        engineerSet.add(authorLogin);

        // Upsert engineer
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
              displayName: commit.commit.author?.name || authorLogin,
              avatarUrl: commit.author?.avatar_url || null,
            })
            .returning();
          engineerId = inserted.id;
        }

        // Check if commit already exists
        const existingCommit = await db.query.commits.findFirst({
          where: eq(schema.commits.sha, commit.sha),
        });
        if (existingCommit) continue;

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

        await db.insert(schema.commits).values({
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
        });
        totalCommits++;
      }
    } catch {
      // Skip repo if listing commits fails (e.g., empty repo)
    }

    // Step 3: Fetch PRs
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
          additions: (pr as Record<string, unknown>).additions as number || 0,
          deletions: (pr as Record<string, unknown>).deletions as number || 0,
          reviewComments: (pr as Record<string, unknown>).review_comments as number || 0,
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
    repos: reposResponse.length,
    commits: totalCommits,
    prs: totalPrs,
    engineers: engineerSet.size,
  };
}
