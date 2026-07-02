import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  turbopack: {
    root: import.meta.dirname, // 明确指定项目根目录，避免 lockfile 警告
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  // [修复] API 代理重写规则 - 解决跨域 Cookie 问题
  // 开发环境下将 /api/* 请求代理到后端，使前后端同域，Cookie 可正常发送
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
      {
        source: "/static/:path*",
        destination: `${apiUrl}/static/:path*`,
      },
    ];
  },
  images: {
    formats: ["image/avif", "image/webp"],
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
      // 局域网 IP 段（开发环境手机调试）
      // 注：Next.js remotePatterns 对纯 IP 通配支持不明确，
      // 若匹配失败，依赖 getFileUrl 返回相对路径 + Image unoptimized 兜底
      {
        protocol: "http",
        hostname: "192.168.*.*",
        port: "8000",
        pathname: "/static/**",
      },
      {
        protocol: "http",
        hostname: "10.*.*.*",
        port: "8000",
        pathname: "/static/**",
      },
    ],
  },
};

export default nextConfig;
