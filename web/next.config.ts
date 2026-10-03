import type { NextConfig } from "next";

// Static export: served from S3 behind CloudFront, which routes /api/* to FastAPI.
// Locally, NEXT_PUBLIC_API_BASE points at the dev API (rewrites are unavailable with export).
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Dev only: lets the page work when opened as 127.0.0.1 instead of localhost.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
