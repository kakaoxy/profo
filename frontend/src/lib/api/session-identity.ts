/**
 * 浏览器端会话身份登记（admin / customer）。
 *
 * 背景（spec `techdebt-config-unify` F1）：原 `lib/api-client.ts` 靠
 * `window.location.pathname.startsWith("/admin")` 嗅探身份来决定 401 刷新端点，
 * 导致「C 端页面复用引用 admin client 的组件」时走错刷新端点 / 跳错登录页。
 *
 * 现在改由**路由组显式登记**身份（`SessionIdentityBridge` 在 (main) / (c) 布局渲染），
 * 请求层只读取登记结果，不再嗅探 pathname —— 组件中立性恢复：
 * 同一组件在哪个路由组渲染，就用该路由组的会话语义。
 *
 * 默认 customer：与改动前「非 /admin 路径走 C 端语义」保持一致，避免未登记场景误用
 * admin 端点（admin 端点刷新失败会清 admin cookie，副作用更大）。
 */

export type SessionIdentity = "admin" | "customer";

export interface AuthEndpoints {
  /** 401 时用于刷新会话的 Route Handler 路径 */
  refreshEndpoint: string;
  /** 会话确定性失效后的登录页路径 */
  loginPath: string;
}

export const AUTH_ENDPOINTS: Record<SessionIdentity, AuthEndpoints> = {
  admin: { refreshEndpoint: "/api/auth/refresh", loginPath: "/admin/login" },
  customer: { refreshEndpoint: "/api/auth/c/refresh", loginPath: "/login" },
};

let activeIdentity: SessionIdentity | null = null;

/** 登记当前路由组的会话身份（由 SessionIdentityBridge 在布局渲染时调用） */
export function setSessionIdentity(identity: SessionIdentity): void {
  activeIdentity = identity;
}

/** 当前已登记身份（未登记返回 null，供测试与调试） */
export function getSessionIdentity(): SessionIdentity | null {
  return activeIdentity;
}

/** 解析当前请求应使用的认证端点（未登记时回退 customer 语义） */
export function resolveAuthEndpoints(): AuthEndpoints {
  return AUTH_ENDPOINTS[activeIdentity ?? "customer"];
}
