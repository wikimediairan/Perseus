export const GITHUB_REPO = {
  owner: "NedaMani",
  name: "wikipedia-persius",
} as const;

export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO.owner}/${GITHUB_REPO.name}/releases`;
export const GITHUB_LATEST_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.name}/releases/latest`;
