import type { NextConfig } from "next";

// Static export: served from S3 behind CloudFront, which routes /api/* to FastAPI.
// Locally, NEXT_PUBLIC_API_BASE points at the dev API (rewrites are unavailable with export).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
