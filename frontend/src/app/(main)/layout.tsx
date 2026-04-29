import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-server";
import { ErrorBoundary } from "@/components/error-boundary";

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
      console.error("获取用户信息失败:", error, "状态码:", status);
      // 如果是 401，说明 token 刷新也失败了，返回 null 让页面重定向
      if (status === 401) {
        return null;
      }
      // 其他错误（如 403, 500 等），尝试返回 data（可能部分数据可用）
      return data;
    }
    return data;
  } catch (e) {
    // 捕获网络错误 (例如后端没启动)，返回 null 防止页面崩溃
    console.error("获取用户信息失败 (可能是后端未启动):", e);
    return null;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
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
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-card to-muted text-white font-bold text-[10px]">
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
