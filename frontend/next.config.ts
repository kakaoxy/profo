import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      // [新增] 将 Server Actions 的请求体限制增加到 10MB (或是你需要的大小)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
