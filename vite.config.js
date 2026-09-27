const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1];
const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true' && repoName;

export default {
  base: isGitHubPagesBuild ? `/${repoName}/` : '/',
  build: { target: 'esnext', chunkSizeWarningLimit: 2500 },
};
