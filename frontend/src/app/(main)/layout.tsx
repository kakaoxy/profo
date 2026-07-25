import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { ErrorBoundary } from "@/components/error-boundary";
import { PermissionGuard } from "@/components/permission-guard";
import { AdminMobileTabBar } from "@/components/admin-mobile-tab-bar";

// 统一设置动态渲染：所有使用 cookies/headers 的子页面都需要
export const dynamic = 'force-dynamic';

async function getUser() {
  try {
    const client = await fetchClient();
    const { data, error, response } = await client.GET("/api/v1/auth/me");
    // [修复] 区分 401 错误和其他错误
    // 401 错误会在 fetchClient 中自动处理刷新，如果刷新失败才会返回 error
    // 其他错误（如网络错误）才返回 null
    if (error) {
      const status = (response as Response | undefined)?.status;
      logger.error("获取用户信息失败", { status, message: `HTTP ${status ?? "unknown"}` });
      // 如果是 401，说明 token 刷新也失败了，返回 null 让页面重定向
      if (status === 401) {
        return null;
      }
      // 429 速率限制：用户仍处于认证状态，不应登出
      // 返回特殊标记，由 layout 渲染限流提示，而非重定向到登录页
      if (status === 429) {
        return { rateLimited: true } as const;
      }
      // 其他错误（如 403, 500 等），尝试返回 data（可能部分数据可用）
      return data;
    }
    return data;
  } catch (e) {
    // Task 8: fetchClient 在 Server Component 上下文遇到 401 时会调用
    // redirect("/api/auth/refresh?next=...") 抛出 NEXT_REDIRECT 错误。
    // 必须放行该错误交由 Next.js 渲染层处理 303 跳转，否则用户会被误判
    // 为未登录并重定向到 /admin/login，丢失原本可刷新的 refresh_token。
    if (isRedirectError(e)) throw e;
    // 捕获网络错误 (例如后端没启动)，返回 null 防止页面崩溃
    logger.error("获取用户信息失败 (可能是后端未启动):", e);
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  // 429 限流：渲染限流提示，不重定向到登录页（用户仍处于认证状态）
  if (user && "rateLimited" in user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-8">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-xl font-semibold text-foreground">请求过于频繁</h2>
          <p className="text-muted-foreground">请稍后刷新页面重试</p>
        </div>
      </div>
    );
  }

  if (!user) {
    redirect("/admin/login");
  }

  // 客户端权限守卫：Next.js 16 中 Server Component 无法通过 headers() 获取
  // pathname（x-invoke-path / x-pathname 已移除），改用 Client Component
  // PermissionGuard 在客户端用 usePathname() 做权限拦截。
  // 后端 API 已基于权限码校验（require_permission），客户端守卫仅用于提升
  // 用户体验（避免显示空数据页面），被绕过也安全。

  return (
    <SidebarProvider defaultOpen={false}>
      {/* 1. 侧边栏 */}
      <AppSidebar user={user} />

      {/* 2. 主体区域 (移除了 Header) */}
      <SidebarInset className="bg-card min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {/* 移动端顶部导航栏 - 简化为只显示 Logo */}
        <header className="flex md:hidden items-center h-14 px-4 border-b bg-card/80 backdrop-blur-xl sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-[10px]">
              P
            </div>
            <span className="font-semibold text-sm text-foreground">Profo</span>
          </div>
        </header>
        {/* 客户端权限守卫 + 直接渲染子页面 */}
        <ErrorBoundary>
          <PermissionGuard>{children}</PermissionGuard>
        </ErrorBoundary>
        {/* 移动端底部 Tab Bar（fixed 定位，不影响布局流） */}
        <AdminMobileTabBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
