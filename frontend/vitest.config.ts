import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/lib/api-types.d.ts",
        "src/components/ui/**",
        "src/test/**",
        "**/*.test.{ts,tsx}",
        // 页面组件（薄包装层，逻辑在子组件和 hooks 中）
        "src/app/**/page.tsx",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/app/**/not-found.tsx",
        // API 路由处理器（需真实 HTTP 环境测试）
        "src/app/api/**",
        // 纯 UI 展示组件（无业务逻辑）
        "src/components/c/**",
        "src/components/common/**",
        // 自动生成的类型和索引文件
        "src/lib/api-types.d.ts",
        "**/index.ts",
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

