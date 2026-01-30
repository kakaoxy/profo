import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: import.meta.dirname, // 明确指定项目根目录，避免 lockfile 警告
  },
  experimental: {
    serverActions: {
      // [新增] 将 Server Actions 的请求体限制增加到 10MB (或是你需要的大小)
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "**.5i5j.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.5i5j.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "**.ljcdn.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.ljcdn.com",
        port: "",
        pathname: "/**",
      },
      {
        // 生产环境图片服务器
        protocol: "https",
        hostname: "fangmengchina.com",
        port: "",
        pathname: "/static/**",
      },
      {
        // 本地开发环境图片服务器
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
        pathname: "/static/**",
      },
      {
        // 本地开发环境 localhost
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/static/**",
      },
    ],
  },
};

export default nextConfig;
