"use client";

import { setSessionIdentity, type SessionIdentity } from "@/lib/api/session-identity";

/**
 * 会话身份登记桥（无 UI，渲染即登记）。
 *
 * 请求层（`lib/api-client.ts` / `lib/swr.ts`）在 401 时需要知道「该用哪套刷新端点与
 * 登录页」。旧实现靠 `window.location.pathname.startsWith("/admin")` 嗅探，破坏了
 * 组件中立性（C 端页面复用 admin 组件会走错端点，spec F1）。
 *
 * 现在由路由组在布局里**显式声明**：
 * - `app/(main)/layout.tsx` → `identity="admin"`
 * - `app/(c)/layout.tsx` → `identity="customer"`
 *
 * 登记在渲染阶段同步完成（非 useEffect），保证同一提交内的任何子组件请求
 * 都已拿到本路由组的身份，不存在「首屏请求用旧身份」的窗口。
 */
export function SessionIdentityBridge({ identity }: { identity: SessionIdentity }) {
  setSessionIdentity(identity);
  return null;
}
