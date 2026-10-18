import { auth } from "@/auth";
import { getApiUrl } from "../config";
import { createServerActionFetch } from "@/lib/api/create-server-action-fetch";

/**
 * C 端 Server Action 统一 fetch（薄封装，spec D12）。
 *
 * 401 自动刷新重试的实现集中在 `lib/api/create-server-action-fetch.ts`；
 * 本文件只负责注入 C 端 Auth 实例（cookie 名 c_access_token / c_refresh_token）。
 * ⚠️ 仅限 Server Action / Route Handler 上下文（可写 cookie）；Server Component
 * 的 401 处理仍在 `lib/api-server.ts`（RSC redirect 语义，不可合并）。
 */
export const cServerActionFetch = createServerActionFetch({
  config: auth.config,
  apiBase: getApiUrl(""),
});
