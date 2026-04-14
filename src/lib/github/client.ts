import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

const ThrottledOctokit = Octokit.plugin(throttling);

export function createGitHubClient() {
  return new ThrottledOctokit({
    auth: process.env.GITHUB_TOKEN,
    throttle: {
      onRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
        console.warn(
          `Rate limit hit for ${options.method} ${options.url}, retrying after ${retryAfter}s`
        );
        return true;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: Record<string, unknown>
      ) => {
        console.warn(
          `Secondary rate limit for ${options.method} ${options.url}`
        );
        return true;
      },
    },
  });
}

export const githubOrg = () => process.env.GITHUB_ORG || "";
