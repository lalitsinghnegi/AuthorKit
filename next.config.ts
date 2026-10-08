import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Loaded from node_modules at runtime: stylelint resolves its rules and configs
  // relative to its own files, which breaks when bundled.
  serverExternalPackages: ["stylelint", "stylelint-config-standard"],
};

export default nextConfig;
