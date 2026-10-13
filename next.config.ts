import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-auth", "bun:sqlite"],
};

export default nextConfig;
