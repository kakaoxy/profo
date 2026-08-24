/**
 * 从仓库根目录 .env 读取 OSS_PUBLIC_BASE_URL / OSS_WATERMARK_STYLE，
 * 生成 miniapp/utils/env.ts.
 *
 * 小程序为原生项目（无打包器），运行时读不到环境变量，
 * 采用与 `pnpm gen-api` 相同的"生成并提交产物"惯例：
 * 修改根目录 .env 后执行 `pnpm gen-env`，并将生成的 env.ts 一并提交。
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(rootDir, ".env");
const outPath = path.join(rootDir, "miniapp", "utils", "env.ts");

const vars = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (line.trim().startsWith("#")) {
    continue;
  }
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!match) {
    continue;
  }
  let value = match[2].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  vars[match[1]] = value;
}

const ossBaseUrl = vars.OSS_PUBLIC_BASE_URL ?? "";
if (!ossBaseUrl) {
  console.error(
    "gen-env 失败：根目录 .env 缺少 OSS_PUBLIC_BASE_URL（与线上 /root/profo/.env 保持一致）",
  );
  process.exit(1);
}

const watermarkStyle = vars.OSS_WATERMARK_STYLE ?? "";
if (!watermarkStyle) {
  console.error("gen-env 失败：根目录 .env 缺少 OSS_WATERMARK_STYLE（OSS 控制台图片处理样式名）");
  process.exit(1);
}

const content = `// 此文件由 \`pnpm gen-env\` 从仓库根目录 .env 生成，请勿手改；修改 .env 后重新生成并提交.
export const OSS_BASE_URL = "${ossBaseUrl}";
export const WATERMARK_STYLE = "${watermarkStyle}";
`;

writeFileSync(outPath, content, "utf8");
console.log(
  `gen-env 完成：${path.relative(rootDir, outPath)}（OSS_BASE_URL=${ossBaseUrl}, WATERMARK_STYLE=${watermarkStyle}）`,
);
