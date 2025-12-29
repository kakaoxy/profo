import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-server";

async function getUser() {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/auth/me");
    if (error) return null;
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
  const cookieStore = await cookies();
  // 默认展开，只有明确设置为 false 时才折叠
  const defaultOpen = cookieStore.get("sidebar:state")?.value !== "false";
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {/* 1. 侧边栏 */}
      <AppSidebar user={user} />
      
      {/* 2. 主体区域 (移除了 Header) */}
      <SidebarInset className="bg-white">
        {/* 移动端顶部导航栏 */}
        <header className="flex md:hidden items-center h-14 px-4 border-b bg-white/80 backdrop-blur-xl sticky top-0 z-40">
          <SidebarTrigger className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg" />
          <div className="ml-3 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-slate-800 to-slate-600 text-white font-bold text-[10px]">
              P
            </div>
            <span className="font-semibold text-sm text-slate-800">Profo</span>
          </div>
        </header>
        {/* 直接渲染子页面，没有公共头了 */}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}