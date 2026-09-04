import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPages ? "/BengTiPredictor" : "",
  assetPrefix: isGitHubPages ? "/BengTiPredictor/" : undefined,
  // Next 16's CLI runner loses the captured `tsc --showConfig` output in this
  // environment. TypeScript 5 still exposes the compiler API, so use Next's
  // in-process checker instead.
  experimental: {
    useTypeScriptCli: false,
  },
};

export default nextConfig;
