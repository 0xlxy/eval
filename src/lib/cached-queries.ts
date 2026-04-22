/**
 * Cached aggregate queries. Data refreshes hourly via the cron, so a
 * short TTL is safe and avoids hammering Turso on every page load.
 *
 * Call these instead of ad-hoc drizzle queries on heavy dashboard pages.
 */
import { unstable_cache } from "next/cache";
import { db, schema } from "@/lib/db";
import { sql, eq, desc, and } from "drizzle-orm";
import { isBotUsername } from "@/lib/filters";

const TTL_SECONDS = 300; // 5 minutes — cron runs hourly, this keeps dashboards snappy

export const getWeeklyStats = unstable_cache(
  async () => {
    return db
      .select({
        date: sql<string>`date(${schema.commits.committedAt}, 'unixepoch')`,
        commits: sql<number>`count(*)`,
        engineers: sql<number>`count(distinct ${schema.commits.engineerId})`,
        repos: sql<number>`count(distinct ${schema.commits.repoId})`,
      })
      .from(schema.commits)
      .groupBy(sql`date(${schema.commits.committedAt}, 'unixepoch')`)
      .orderBy(desc(sql`date(${schema.commits.committedAt}, 'unixepoch')`));
  },
  ["weekly-stats"],
  { revalidate: TTL_SECONDS, tags: ["commits"] }
);

export const getTotalCounts = unstable_cache(
  async () => {
    const totalEngineers = await db
      .select({ cnt: sql<number>`count(distinct ${schema.commits.engineerId})` })
      .from(schema.commits);
    const totalRepos = await db
      .select({ cnt: sql<number>`count(distinct ${schema.commits.repoId})` })
      .from(schema.commits);
    return {
      engineers: totalEngineers[0]?.cnt || 0,
      repos: totalRepos[0]?.cnt || 0,
    };
  },
  ["total-counts"],
  { revalidate: TTL_SECONDS, tags: ["commits"] }
);

export const getEngineerLeaderboard = unstable_cache(
  async () => {
    const rows = await db
      .select({
        username: schema.engineers.username,
        displayName: schema.engineers.displayName,
        commits: sql<number>`count(*)`,
        linesAdded: sql<number>`sum(${schema.commits.linesAdded})`,
        linesDeleted: sql<number>`sum(${schema.commits.linesDeleted})`,
      })
      .from(schema.commits)
      .innerJoin(
        schema.engineers,
        eq(schema.commits.engineerId, schema.engineers.id)
      )
      .groupBy(schema.engineers.id)
      .orderBy(desc(sql`count(*)`));
    return rows.filter((e) => !isBotUsername(e.username));
  },
  ["engineer-leaderboard-no-bots"],
  { revalidate: TTL_SECONDS, tags: ["commits"] }
);

export const getRepoActivity = unstable_cache(
  async () => {
    return db
      .select({
        name: schema.repos.name,
        commits: sql<number>`count(*)`,
      })
      .from(schema.commits)
      .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
      .groupBy(schema.repos.name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
  },
  ["repo-activity"],
  { revalidate: TTL_SECONDS, tags: ["commits"] }
);

export const getWeekRangeStats = unstable_cache(
  async (startTs: number, endTs: number) => {
    const stats = await db
      .select({
        engineers: sql<number>`count(distinct ${schema.commits.engineerId})`,
        repos: sql<number>`count(distinct ${schema.commits.repoId})`,
      })
      .from(schema.commits)
      .where(
        and(
          sql`${schema.commits.committedAt} >= ${startTs}`,
          sql`${schema.commits.committedAt} <= ${endTs}`
        )
      );
    return {
      engineers: stats[0]?.engineers || 0,
      repos: stats[0]?.repos || 0,
    };
  },
  ["week-range"],
  { revalidate: TTL_SECONDS, tags: ["commits"] }
);
