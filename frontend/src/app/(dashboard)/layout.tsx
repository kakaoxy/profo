import { cookies } from "next/headers";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { fetchClient } from "@/lib/api-client";
import { Separator } from "@/components/ui/separator";

async function getUser() {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/auth/me");
  if (error) return null;
  return data;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar:state")?.value === "true";
  const user = await getUser();

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar user={user} />
      <SidebarInset>
        {/* 这里修复了 group-has 警告 */}
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <h1 className="text-sm font-medium">工作台</h1>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 bg-gray-50/50">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}