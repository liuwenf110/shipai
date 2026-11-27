/** @type {import('next').NextConfig} */
const nextConfig = {
  // 发布在现有域名的子路径下（如 /shipai），本地开发留空
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  outputFileTracingRoot: import.meta.dirname,
  experimental: {
    // 只配 serverActions：App Router 的 Route Handler（/api/uploads）不吃这个上限，实测 9MB 也能完整
    // 解析到 saveProofFile（Next 15.5 已无 experimental.bodySizeLimit 键，写了会被判无效配置忽略）；
    // 外层还有 nginx client_max_body_size 12m 兑底
    serverActions: {
      bodySizeLimit: "8mb",
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
