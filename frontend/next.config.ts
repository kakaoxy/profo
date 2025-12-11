import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // 禁用 Turbopack，使用 Webpack 以解决 Semi Design CSS 兼容性问题
  transpilePackages: ['@douyinfe/semi-ui', '@douyinfe/semi-icons', '@douyinfe/semi-illustrations'],
};

export default nextConfig;
