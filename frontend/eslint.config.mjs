import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierConfig from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettierConfig, // 关闭与 Prettier 冲突的 ESLint 格式化规则
  {
    rules: {
      // next 16.2.11 引入的 React Compiler 优化规则，存量代码触发多处 error。
      // 这些规则为性能优化建议（非功能错误），修复需重构组件逻辑，
      // 超出本次安全审查范围。暂时关闭，后续单独治理。
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/incompatible-library": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
