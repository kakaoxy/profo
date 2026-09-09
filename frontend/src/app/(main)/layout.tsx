import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { ErrorBoundary } from "@/components/error-boundary";
import { PermissionGuard } from "@/components/permission-guard";
import { AdminMobileTabBar } from "@/components/admin-mobile-tab-bar";

// 统一设置动态渲染：所有使用 cookies/headers 的子页面都需要
export const dynamic = "force-dynamic";

async function getUser() {
  try {
    const client = await fetchClient();
    const { data, error, response } = await client.GET("/api/v1/auth/me");
    // [修复] 区分会话失效（401/403）与其他错误
    // 401/403 会在 fetchClient 中先自动刷新，刷新失败才会返回 error
    //（此时会话已确定性失效，交由 layout 重定向登录）
    // 其他错误（如网络错误）不作为登出依据
    if (error) {
      const status = (response as Response | undefined)?.status;
      logger.error("获取用户信息失败", { status, message: `HTTP ${status ?? "unknown"}` });
      // 401（token 刷新也失败）/403（账号已禁用，见 backend /me 语义）：
      // 两者都是会话确定性失效，返回 null 让页面重定向登录
      if (status === 401 || status === 403) {
        return null;
      }
      // 429 速率限制：用户仍处于认证状态，不应登出
      // 返回特殊标记，由 layout 渲染限流提示，而非重定向到登录页
      if (status === 429) {
        return { rateLimited: true } as const;
      }
      // 其他错误（如 5xx 等服务端/网络问题）：用户会话仍然有效，仅 401 才判
      // 未登录；返回错误标记由 layout 渲染可重试错误态，避免后端抖动被误判
      // 为登出而重定向登录页
      return { serverError: true } as const;
    }
    return data;
  } catch (e) {
    // Task 8: fetchClient 在 Server Component 上下文遇到 401 时会调用
    // redirect("/api/auth/refresh?next=...") 抛出 NEXT_REDIRECT 错误。
    // 必须放行该错误交由 Next.js 渲染层处理 303 跳转，否则用户会被误判
    // 为未登录并重定向到 /admin/login，丢失原本可刷新的 refresh_token。
    if (isRedirectError(e)) throw e;
    // 捕获网络异常 (例如后端没启动)：仅 401 判未登录，网络异常不能证明会话
    // 失效，返回错误标记渲染可重试错误态，避免后端抖动被误判为登出
    logger.error("获取用户信息失败 (可能是后端未启动):", e);
    return { serverError: true } as const;
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
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

  // 5xx/网络错误：渲染可重试错误态，不重定向登录页（用户会话仍然有效）
  if (user && "serverError" in user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-8">
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-xl font-semibold text-foreground">服务暂时不可用</h2>
          <p className="text-muted-foreground">后端服务暂时无法访问，请稍后刷新页面重试</p>
        </div>
      </div>
    );
  }

  if (!user) {
    const headersList = await headers();
    const pathname = headersList.get("x-pathname") ?? "/admin";
    redirect(`/admin/login?redirect=${encodeURIComponent(pathname)}`);
  }

  // 客户端权限守卫：Next.js 16 中 Server Component 无法通过 headers() 获取
  // pathname（x-invoke-path / x-pathname 已移除），改用 Client Component
  // PermissionGuard 在客户端用 usePathname() 做权限拦截。
  // 后端 API 已基于权限码校验（require_permission），客户端守卫仅用于提升
  // 用户体验（避免显示空数据页面），被绕过也安全。

  return (
    // overflow-clip 覆盖基类 overflow-hidden：hidden 会创建滚动容器，破坏后代
    // sticky（详情页副栏等）相对 viewport 吸附；clip 裁剪效果不变且不创建滚动容器
    <SidebarProvider defaultOpen={false} className="overflow-clip">
      {/* 1. 侧边栏 */}
      <AppSidebar user={user} />

      {/* 2. 主体区域 (移除了 Header) */}
      <SidebarInset className="bg-card min-w-0 overflow-clip pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
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
