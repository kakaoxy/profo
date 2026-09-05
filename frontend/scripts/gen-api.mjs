// gen-api 前置校验脚本：确认 :8000 是本项目后端且 schema 完整后再生成类型，
// 防止后端未运行/其他服务占用端口/后端为过期构建时静默产出错误或过期的 api-types.d.ts
import { execSync } from "node:child_process";

const OPENAPI_URL = "http://127.0.0.1:8000/openapi.json";
// 与 backend/settings.py 的 app_name 保持一致
const EXPECTED_TITLE = "Profo 房产数据中心";
// 稳定性哨兵 schema：缺失说明 :8000 上的后端为过期/异常构建（如缺 today_* 字段的旧代码）
const REQUIRED_SCHEMA = "PublicShareStatsResponse";

try {
  const res = await fetch(OPENAPI_URL);
  if (!res.ok) {
    throw new Error(`后端响应异常：HTTP ${res.status}`);
  }
  const schema = await res.json();
  if (schema.info?.title !== EXPECTED_TITLE) {
    throw new Error(`openapi title 不匹配：${schema.info?.title}（期望 ${EXPECTED_TITLE}），:8000 可能不是本项目后端`);
  }
  if (!schema.components?.schemas?.[REQUIRED_SCHEMA]) {
    throw new Error(`openapi 缺少核心 schema ${REQUIRED_SCHEMA}，后端可能为过期或异常构建`);
  }
} catch (err) {
  console.error(`[gen-api] 前置校验失败：${err.message}`);
  console.error("[gen-api] 请先启动后端：uvicorn main:app --reload --host 0.0.0.0 --port 8000");
  process.exit(1);
}

execSync(`openapi-typescript ${OPENAPI_URL} -o src/lib/api-types.d.ts`, { stdio: "inherit" });
