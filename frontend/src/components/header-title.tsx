"use client";

import * as React from "react";
import Link from "next/link"; // 引入 Next.js 的 Link
import {
  LayoutDashboard,
  Building2,
  PhoneIncoming,
  FolderKanban,
  Users,
  LogOut,
  ChevronRight,
  MoreHorizontal, // 增加这个图标用于容错
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/app/login/actions";

interface User {
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  role?: {
    name: string;
  };
}

const data = {
  navMain: [
    {
      title: "工作台",
      url: "/",
      icon: LayoutDashboard,
      isActive: true,
    },
    {
      title: "房源管理",
      url: "#", // 父级菜单不需要跳转
      icon: Building2,
      items: [
        { title: "房源列表", url: "/properties" },
        { title: "批量上传", url: "/properties/upload" },
        { title: "数据治理", url: "/properties/governance" },
      ],
    },
    {
      title: "线索管理",
      url: "/leads",
      icon: PhoneIncoming,
    },
    {
      title: "项目管理",
      url: "/projects",
      icon: FolderKanban,
    },
    {
      title: "用户管理",
      url: "#",
      icon: Users,
      items: [
        { title: "用户列表", url: "/users" },
        { title: "权限管理", url: "/users/roles" },
      ],
    },
  ],
};

export function AppSidebar({ user }: { user: User | null }) {
  // 获取侧边栏状态
  const { state, isMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center justify-between px-1 py-2">
          {state === "expanded" && (
             <div className="flex items-center gap-2 px-2 transition-all">
               <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-xs">
                 P
               </div>
               <span className="truncate font-semibold text-sm">Profo Admin</span>
             </div>
          )}
          <SidebarTrigger />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {data.navMain.map((item) => {
              // 逻辑判断：是否包含子菜单
              const hasSubmenu = item.items && item.items.length > 0;

              // --- 场景 1: 没有子菜单 (直接跳转) ---
              if (!hasSubmenu) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton 
                      asChild 
                      tooltip={item.title} // 折叠时显示 Tooltip
                      isActive={item.isActive} // 高亮状态（这里需要你自己实现路由判断逻辑，或者由 props 传入）
                    >
                      <Link href={item.url}>
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              // --- 场景 2: 有子菜单 ---
              
              // A. 折叠状态 (Collapsed): 使用 DropdownMenu 弹出子菜单
              if (state === "collapsed") {
                return (
                  <SidebarMenuItem key={item.title}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuButton tooltip={item.title}>
                          {item.icon && <item.icon />}
                          <span>{item.title}</span>
                          <ChevronRight className="ml-auto opacity-50" />
                        </SidebarMenuButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="right" align="start" className="min-w-56 rounded-lg bg-white border shadow-lg z-50">
                        <DropdownMenuLabel className="text-xs text-muted-foreground">
                          {item.title}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {item.items!.map((subItem) => (
                          <DropdownMenuItem key={subItem.title} asChild>
                            <Link href={subItem.url} className="cursor-pointer w-full">
                              {subItem.title}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                );
              }

              // B. 展开状态 (Expanded): 使用 Collapsible 手风琴
              return (
                <Collapsible
                  key={item.title}
                  asChild
                  defaultOpen={item.isActive} // 这里可以根据路由判断是否默认展开
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.title}>
                        {item.icon && <item.icon />}
                        <span>{item.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items!.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild>
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      
      {/* 底部用户信息区域 (保持 Dropdown 逻辑) */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user?.avatar || ""} alt={user?.username} />
                    <AvatarFallback className="rounded-lg">
                      {user?.username?.slice(0, 2).toUpperCase() || "CN"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.nickname || user?.username}</span>
                    <span className="truncate text-xs">{user?.role?.name || "管理员"}</span>
                  </div>
                  <MoreHorizontal className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-white"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={4}
              >
                <div className="p-2 text-xs text-muted-foreground border-b mb-1">
                  {user?.nickname || user?.username}
                </div>
                <DropdownMenuItem onClick={() => logoutAction()} className="cursor-pointer text-red-600 focus:text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}