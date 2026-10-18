import { resolveAuthEndpoints } from "@/lib/api/session-identity";
import { createApiClient } from "@/lib/api/create-api-client";

/**
 * 场景：客户端组件（Client Components）发起的 API 请求。
 *
 * 由工厂统一装配 credentials + 401 刷新/重试/跳登录，**不再靠 pathname 嗅探身份**：
 * 刷新端点与登录页在 401 发生时读取当前路由组登记的身份
 * （`(main)` = admin / `(c)` = customer，见 `lib/api/session-identity.ts`）。
 *
 * 这样任何组件（含 admin/C 共用组件）在哪个路由组渲染，就用该路由组的会话语义；
 * 历史 `lib/api-c/client.ts`（`cClient`）已无调用方，随之删除（spec T2.5）。
 *
 * [安全修复] 通过 credentials 中间件确保所有请求携带 httpOnly Cookie。
 */
export const client = createApiClient({
  refreshEndpoint: () => resolveAuthEndpoints().refreshEndpoint,
  loginPath: () => resolveAuthEndpoints().loginPath,
});
