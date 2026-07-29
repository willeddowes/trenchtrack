import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "a.espncdn.com",
        pathname: "/i/teamlogos/nfl/500/**",
      },
    ],
  },
};

export default nextConfig;
