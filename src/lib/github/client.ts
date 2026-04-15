import { Octokit } from "@octokit/rest";
import { throttling } from "@octokit/plugin-throttling";

const ThrottledOctokit = Octokit.plugin(throttling);

export function createGitHubClient() {
  return new ThrottledOctokit({
    auth: process.env.GITHUB_TOKEN,
    throttle: {
      onRateLimit: (retryAfter: number, options: Record<string, unknown>) => {
        console.warn(
          `Rate limit hit for ${options.method} ${options.url} (not retrying; suggested wait ${retryAfter}s)`
        );
        // Do not retry/wait on rate limits (user preference: stop immediately).
        return false;
      },
      onSecondaryRateLimit: (
        retryAfter: number,
        options: Record<string, unknown>
      ) => {
        console.warn(
          `Secondary rate limit for ${options.method} ${options.url} (not retrying; suggested wait ${retryAfter}s)`
        );
        return false;
      },
    },
  });
}

export const githubOrg = () => process.env.GITHUB_ORG || "";
