import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-server";

async function getUser() {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/auth/me");
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
  const defaultOpen = cookieStore.get("sidebar:state")?.value === "true";
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
        {/* 直接渲染子页面，没有公共头了 */}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}