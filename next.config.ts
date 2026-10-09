import type { NextConfig } from "next";
import { appCsp, commonHeaders } from "./src/lib/security/headers";

const dev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // Loaded from node_modules at runtime: stylelint resolves its rules and configs
  // relative to its own files, which breaks when bundled.
  serverExternalPackages: ["stylelint", "stylelint-config-standard"],
  experimental: {
    // Largest legitimate upload is a 2 MB project file (presets: 1 MB). The extra room
    // lets the import action reject oversized files with its own message.
    serverActions: { bodySizeLimit: "3mb" },
  },
  async headers() {
    return [
      { source: "/:path*", headers: commonHeaders(!dev) },
      {
        // Every route except the style guide, which sets its own policy so the app can frame it.
        source: "/((?!api/projects/[^/]+/styleguide/).*)",
        headers: [
          { key: "Content-Security-Policy", value: appCsp(dev) },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
