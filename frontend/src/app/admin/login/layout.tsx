import { redirect } from "next/navigation";
import { getApiUrl } from "@/lib/config";
import { getAccessTokenFromCookie } from "@/lib/token-refresh-server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * 判断当前是否已登录（直接用 access_token 问后端，**不走自动刷新**）.
 *
 * 这里刻意不使用 `fetchClient`：它在 Server Component 上下文遇到 401 会
 * `redirect("/api/auth/refresh?next=...")`，而 `/admin/login` 在 proxy 层被跳过鉴权
 * （见 proxy.ts 第 3 步的 skip 列表），未登录访客的刷新必然失败、又被 refresh 路由
 * 303 送回 `/admin/login`，会形成无限重定向环（ERR_TOO_MANY_REDIRECTS）。
 *
 * 任何非 200（401 未登录 / 403 账号停用 / 429 限流 / 5xx 后端不可用）一律视为
 * 「未登录」，放行渲染登录页 —— 与既有行为一致。
 *
 * 注：本函数的 try/catch 只包住 fetch，不会捕获到 NEXT_REDIRECT，
 * 因此无需 `isRedirectError` 守卫。
 */
async function isAuthenticated(): Promise<boolean> {
  const token = await getAccessTokenFromCookie();
  if (!token) {
    return false;
  }

  try {
    const response = await fetch(getApiUrl("/api/v1/auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return response.ok;
  } catch (e) {
    // 后端不可用时允许显示登录页
    logger.error("登录页鉴权检查失败:", e);
    return false;
  }
}

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // 已登录用户访问登录页时直接跳转至工作台。
  // redirect() 抛出的 NEXT_REDIRECT 必须位于 try/catch 之外，否则跳转会被静默吞掉
  // （修复前即为此问题：已登录用户访问 /admin/login 只停留在登录页）。
  if (await isAuthenticated()) {
    redirect("/admin");
  }

  return <>{children}</>;
}
