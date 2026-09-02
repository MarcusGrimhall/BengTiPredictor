import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPages ? "/BengTiPredictor" : "",
  assetPrefix: isGitHubPages ? "/BengTiPredictor/" : undefined,
};

export default nextConfig;
