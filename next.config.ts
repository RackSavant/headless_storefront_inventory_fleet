import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // drei's <Html> overlays each own a React root; StrictMode's dev-only double
  // mount makes them log "synchronously unmount a root" errors. Harmless, but noisy.
  reactStrictMode: false,
  transpilePackages: ["three"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
