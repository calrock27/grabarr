import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [
        // Base paths - REQUIRE trailing slash
        { source: "/api/jobs", destination: "http://127.0.0.1:8001/api/jobs/" },
        { source: "/api/remotes", destination: "http://127.0.0.1:8001/api/remotes/" },
        { source: "/api/credentials", destination: "http://127.0.0.1:8001/api/credentials/" },
        { source: "/api/schedules", destination: "http://127.0.0.1:8001/api/schedules/" },

        // Base paths - REQUIRE NO trailing slash
        { source: "/api/history", destination: "http://127.0.0.1:8001/api/history" },
        { source: "/api/activity", destination: "http://127.0.0.1:8001/api/activity" },

        // Paths with subpaths (ID endpoints usually have NO slash, so we map directly)
        { source: "/api/jobs/:path*", destination: "http://127.0.0.1:8001/api/jobs/:path*" },
        { source: "/api/remotes/:path*", destination: "http://127.0.0.1:8001/api/remotes/:path*" },
        { source: "/api/credentials/:path*", destination: "http://127.0.0.1:8001/api/credentials/:path*" },
        { source: "/api/schedules/:path*", destination: "http://127.0.0.1:8001/api/schedules/:path*" },
        { source: "/api/history/:path*", destination: "http://127.0.0.1:8001/api/history/:path*" },
        { source: "/api/activity/:path*", destination: "http://127.0.0.1:8001/api/activity/:path*" },
        { source: "/api/settings/:path*", destination: "http://127.0.0.1:8001/api/settings/:path*" },
        { source: "/api/security/:path*", destination: "http://127.0.0.1:8001/api/security/:path*" },
        { source: "/api/auth/:path*", destination: "http://127.0.0.1:8001/api/auth/:path*" },
        { source: "/api/system/:path*", destination: "http://127.0.0.1:8001/api/system/:path*" },
      ],
    }
  },
};

export default nextConfig;
