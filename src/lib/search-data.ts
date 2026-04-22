import { unstable_cache } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, sql, desc } from "drizzle-orm";

export interface SearchItem {
  kind: "engineer" | "repo" | "page";
  label: string;
  subtitle?: string;
  href: string;
}

export const getSearchItems = unstable_cache(
  async (): Promise<SearchItem[]> => {
    const [engineers, repos] = await Promise.all([
      db
        .select({
          username: schema.engineers.username,
          displayName: schema.engineers.displayName,
          commits: sql<number>`count(*)`,
        })
        .from(schema.commits)
        .innerJoin(
          schema.engineers,
          eq(schema.commits.engineerId, schema.engineers.id)
        )
        .groupBy(schema.engineers.id)
        .orderBy(desc(sql`count(*)`)),
      db
        .select({
          name: schema.repos.name,
          commits: sql<number>`count(*)`,
        })
        .from(schema.commits)
        .innerJoin(schema.repos, eq(schema.commits.repoId, schema.repos.id))
        .groupBy(schema.repos.id)
        .orderBy(desc(sql`count(*)`)),
    ]);

    const pages: SearchItem[] = [
      { kind: "page", label: "Dashboard", href: "/" },
      { kind: "page", label: "Engineers", href: "/engineers" },
      { kind: "page", label: "Commits", href: "/commits" },
      { kind: "page", label: "Repos", href: "/repos" },
    ];

    return [
      ...pages,
      ...engineers.map((e) => ({
        kind: "engineer" as const,
        label: e.displayName || e.username,
        subtitle: `@${e.username} · ${e.commits} commits`,
        href: `/engineer/${e.username}`,
      })),
      ...repos.map((r) => ({
        kind: "repo" as const,
        label: r.name,
        subtitle: `${r.commits} commits`,
        href: `/repo/${r.name}`,
      })),
    ];
  },
  ["search-items"],
  { revalidate: 600, tags: ["commits"] }
);
