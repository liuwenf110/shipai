/** @type {import('next').NextConfig} */
const nextConfig = {
  // 发布在现有域名的子路径下（如 /shipai），本地开发留空
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
