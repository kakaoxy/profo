import { logger } from "@/lib/logger";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-server";
import { ErrorBoundary } from "@/components/error-boundary";

// 统一设置动态渲染：所有使用 cookies/headers 的子页面都需要
export const dynamic = 'force-dynamic';

// 受限路径前缀 → 允许访问的角色代码列表（对齐 app-sidebar.tsx 的 roles 配置）
// 不在此列表的路径对所有后台角色（admin/operator/user）开放
const PATH_ROLE_RESTRICTIONS: ReadonlyArray<{
  prefix: string;
  roles: ReadonlyArray<string>;
}> = [
  // 房源管理 → 批量上传/数据治理：admin + operator
  { prefix: "/admin/properties/upload", roles: ["admin", "operator"] },
  { prefix: "/admin/properties/governance", roles: ["admin", "operator"] },
  // 用户管理：admin only
  { prefix: "/admin/users", roles: ["admin"] },
  // 设置：admin + operator
  { prefix: "/admin/settings", roles: ["admin", "operator"] },
];

/**
 * 判断路径是否为后台受限路径（有角色要求）。
 */
export function isRestrictedAdminPath(pathname: string): boolean {
  return PATH_ROLE_RESTRICTIONS.some(({ prefix }) => pathname.startsWith(prefix));
}

/**
 * 判断角色代码是否具备指定路径的访问权限。
 * 非受限路径返回 true（对所有后台角色开放）。
 */
export function hasAdminAccess(
  pathname: string,
  roleCode: string | undefined | null,
): boolean {
  for (const { prefix, roles } of PATH_ROLE_RESTRICTIONS) {
    if (pathname.startsWith(prefix)) {
      return roleCode != null && roles.includes(roleCode);
    }
  }
  return true;
}

async function getUser() {
  try {
    const client = await fetchClient();
    const { data, error, response } = await client.GET("/api/v1/auth/me");
    // [修复] 区分 401 错误和其他错误
    // 401 错误会在 fetchClient 中自动处理刷新，如果刷新失败才会返回 error
    // 其他错误（如网络错误）才返回 null
    if (error) {
      const status = (response as Response | undefined)?.status;
      logger.error("获取用户信息失败:", error, "状态码:", status);
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

  // 服务端角色守卫：受限路径按 PATH_ROLE_RESTRICTIONS 配置的角色要求拦截
  const headersList = await headers();
  const pathname =
    headersList.get("x-invoke-path") ?? headersList.get("x-pathname") ?? "";
  if (!hasAdminAccess(pathname, user?.role?.code)) {
    redirect("/admin");
  }

  return (
    <SidebarProvider defaultOpen={false}>
      {/* 1. 侧边栏 */}
      <AppSidebar user={user} />
      
      {/* 2. 主体区域 (移除了 Header) */}
      <SidebarInset className="bg-card min-w-0">
        {/* 移动端顶部导航栏 */}
        <header className="flex md:hidden items-center h-14 px-4 border-b bg-card/80 backdrop-blur-xl sticky top-0 z-40">
          <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg" />
          <div className="ml-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-[10px]">
              P
            </div>
            <span className="font-semibold text-sm text-foreground">Profo</span>
          </div>
        </header>
        {/* 直接渲染子页面，没有公共头了 */}
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
      </SidebarInset>
    </SidebarProvider>
  );
}
