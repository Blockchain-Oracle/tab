import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        hostname: "**.public.blob.vercel-storage.com",
        pathname: "/merchant-logos/**",
        port: "",
        protocol: "https",
      },
    ],
  },
};

export default nextConfig;
