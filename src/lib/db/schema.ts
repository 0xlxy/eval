import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const engineers = sqliteTable("engineers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const repos = sqliteTable("repos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  fullName: text("full_name").notNull(),
  language: text("language"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const commits = sqliteTable("commits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sha: text("sha").notNull().unique(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repos.id),
  engineerId: integer("engineer_id")
    .notNull()
    .references(() => engineers.id),
  message: text("message").notNull(),
  linesAdded: integer("lines_added").notNull().default(0),
  linesDeleted: integer("lines_deleted").notNull().default(0),
  filesChanged: integer("files_changed").notNull().default(0),
  committedAt: integer("committed_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const pullRequests = sqliteTable("pull_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  githubId: integer("github_id").notNull().unique(),
  repoId: integer("repo_id")
    .notNull()
    .references(() => repos.id),
  engineerId: integer("engineer_id")
    .notNull()
    .references(() => engineers.id),
  title: text("title"),
  state: text("state").notNull(), // 'open' | 'closed' | 'merged'
  additions: integer("additions").notNull().default(0),
  deletions: integer("deletions").notNull().default(0),
  reviewComments: integer("review_comments").notNull().default(0),
  createdAtGh: integer("created_at_gh", { mode: "timestamp" }).notNull(),
  mergedAt: integer("merged_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const dailyAnalyses = sqliteTable(
  "daily_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    engineerId: integer("engineer_id")
      .notNull()
      .references(() => engineers.id),
    date: text("date").notNull(), // 'YYYY-MM-DD'
    commitCount: integer("commit_count").notNull().default(0),
    totalLinesAdded: integer("total_lines_added").notNull().default(0),
    totalLinesDeleted: integer("total_lines_deleted").notNull().default(0),
    totalFilesChanged: integer("total_files_changed").notNull().default(0),
    prsMerged: integer("prs_merged").notNull().default(0),
    prsOpened: integer("prs_opened").notNull().default(0),
    workSummary: text("work_summary"),
    qualityAssessment: text("quality_assessment"),
    efficiencyScore: integer("efficiency_score"), // 1-100
    suggestions: text("suggestions"),
    highlights: text("highlights"),
    rawAnalysis: text("raw_analysis"), // Full JSON from Claude
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("daily_analyses_engineer_date_idx").on(
      table.engineerId,
      table.date
    ),
  ]
);

export const dailyOrgSummaries = sqliteTable("daily_org_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(), // 'YYYY-MM-DD'
  totalCommits: integer("total_commits").notNull().default(0),
  totalPrsMerged: integer("total_prs_merged").notNull().default(0),
  activeEngineers: integer("active_engineers").notNull().default(0),
  activeRepos: integer("active_repos").notNull().default(0),
  orgSummary: text("org_summary"),
  topContributors: text("top_contributors"), // JSON array
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});
