interface EngineerReport {
  username: string;
  displayName: string;
  commitCount: number;
  efficiencyScore: number;
  workSummary: string;
}

interface DailyReport {
  date: string;
  orgSummary: string;
  totalCommits: number;
  totalPrsMerged: number;
  activeEngineers: number;
  activeRepos: number;
  topContributors: string[];
  engineers: EngineerReport[];
  dashboardUrl?: string;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export function formatDailyReport(report: DailyReport): string {
  const e = escapeMarkdown;

  const lines: string[] = [];

  lines.push(`*Daily Dev Report \\- ${e(report.date)}*`);
  lines.push("");

  // Team Summary
  lines.push(`*Team Summary*`);
  lines.push(e(report.orgSummary));
  lines.push("");

  // Stats
  lines.push(
    `Commits: ${report.totalCommits} | PRs Merged: ${report.totalPrsMerged} | Active: ${report.activeEngineers} engineers, ${report.activeRepos} repos`
  );
  lines.push("");

  // Top Contributors
  if (report.engineers.length > 0) {
    lines.push(`*Top Contributors*`);
    const sorted = [...report.engineers].sort(
      (a, b) => b.efficiencyScore - a.efficiencyScore
    );
    const top5 = sorted.slice(0, 5);
    top5.forEach((eng, i) => {
      lines.push(
        `${i + 1}\\. ${e(eng.displayName)} \\- ${eng.commitCount} commits, Score: ${eng.efficiencyScore}/100`
      );
    });
    lines.push("");
  }

  // Dashboard link
  if (report.dashboardUrl) {
    lines.push(`[View Full Report](${e(report.dashboardUrl)}/daily/${e(report.date)})`);
  }

  return lines.join("\n");
}
