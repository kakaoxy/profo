import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone",
  reactCompiler: true,
  // Host 头校验由 nginx 反向代理层负责（Next.js 16 NextConfig 无 allowedHosts 字段）
  turbopack: {
    root: import.meta.dirname, // 明确指定项目根目录，避免 lockfile 警告
  },
  // [修复] /api/* 通过 rewrites 代理走 middleware/proxy 层，默认 10MB 会截断大文件上传
  // 与后端 settings.max_upload_size (500MB) 对齐，真正尺寸边界由后端逐路由控制
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "recharts"],
    proxyClientMaxBodySize: "500mb",
    serverActions: {
      bodySizeLimit: "10mb",
      // allowedOrigins 是「额外」允许的 origin（Next.js 自动允许同源 Host）
      // 只要 nginx 反代正确传递 Host 头（proxy_set_header Host $host），
      // Server Actions 自动工作，PRODUCTION_DOMAIN 非必需。
      // 仅当 nginx 不传递 Host（如 CDN/二级反代）时才需配置 PRODUCTION_DOMAIN。
      allowedOrigins: [
        "localhost:3000",
        "127.0.0.1:3000",
        ...(process.env.PRODUCTION_DOMAIN ? [process.env.PRODUCTION_DOMAIN] : []),
      ],
    },
  },
  // [修复] API 代理重写规则 - 解决跨域 Cookie 问题
  // 开发环境下将 /api/* 请求代理到后端，使前后端同域，Cookie 可正常发送
  async rewrites() {
    // 服务端 SSR 代理优先用 SERVER_API_URL（Docker 容器内直连 backend 容器，避免 127.0.0.1 自指向）
    // 浏览器侧 fallback 用 NEXT_PUBLIC_API_URL（开发环境）或 127.0.0.1:8000
    const apiUrl = process.env.SERVER_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
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
    // [性能优化] 关闭 next/image 自动优化，避免容器内 SSR 代理 + 格式转换导致图片加载慢（8s+）
    // 服务器 CPU 弱（2核），next/image 优化在并发时严重排队
    // 关闭后 <Image> 直接用原图，跳过 frontend 容器代理，图片走 nginx → backend 直服
    unoptimized: true,
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
