import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local network IPs allowed for dev server cross-origin requests (mobile testing)
  allowedDevOrigins: ["10.8.158.106", "10.12.82.229"],
};

export default nextConfig;
