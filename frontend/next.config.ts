import type { NextConfig } from "next";

const backendUrl = process.env.GRABARR_BACKEND_URL || "http://127.0.0.1:8001";

// Generate build timestamp at startup (dev) or build time (prod)
const buildTime = new Date().toISOString();

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  env: {
    NEXT_PUBLIC_BUILD_TIME: buildTime,
    NEXT_PUBLIC_VERSION: '0.1.0',  // Sync with package.json
  },
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        // Base paths - REQUIRE trailing slash
        { source: "/api/jobs", destination: `${backendUrl}/api/jobs/` },
        { source: "/api/remotes", destination: `${backendUrl}/api/remotes` },
        { source: "/api/credentials", destination: `${backendUrl}/api/credentials` },
        { source: "/api/schedules", destination: `${backendUrl}/api/schedules/` },
        { source: "/api/actions", destination: `${backendUrl}/api/actions/` },

        // Base paths - REQUIRE NO trailing slash
        { source: "/api/history", destination: `${backendUrl}/api/history` },
        { source: "/api/activity", destination: `${backendUrl}/api/activity` },

        // Paths with subpaths (ID endpoints usually have NO slash, so we map directly)
        { source: "/api/jobs/:path*", destination: `${backendUrl}/api/jobs/:path*` },
        { source: "/api/remotes/:path*", destination: `${backendUrl}/api/remotes/:path*` },
        { source: "/api/credentials/:path*", destination: `${backendUrl}/api/credentials/:path*` },
        { source: "/api/schedules/:path*", destination: `${backendUrl}/api/schedules/:path*` },
        { source: "/api/history/:path*", destination: `${backendUrl}/api/history/:path*` },
        { source: "/api/activity/:path*", destination: `${backendUrl}/api/activity/:path*` },
        { source: "/api/settings/:path*", destination: `${backendUrl}/api/settings/:path*` },
        { source: "/api/security/:path*", destination: `${backendUrl}/api/security/:path*` },
        { source: "/api/auth/:path*", destination: `${backendUrl}/api/auth/:path*` },
        { source: "/api/system/:path*", destination: `${backendUrl}/api/system/:path*` },
        { source: "/api/actions/:path*", destination: `${backendUrl}/api/actions/:path*` },
        { source: "/api/widgets/:path*", destination: `${backendUrl}/api/widgets/:path*` },
        { source: "/api/events", destination: `${backendUrl}/api/events` },
      ],
    }
  },
};

export default nextConfig;
