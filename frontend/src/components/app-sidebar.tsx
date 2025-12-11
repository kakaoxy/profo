"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  PhoneIncoming,
  FolderKanban,
  Users,
  LogOut,
  ChevronRight,
  MoreHorizontal,
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
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
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
      url: "#",
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
  const { state, isMobile } = useSidebar();
  const pathname = usePathname();

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
              const hasSubmenu = item.items && item.items.length > 0;
              const isActive = pathname === item.url || item.items?.some(sub => pathname.startsWith(sub.url));

              // 修复点 1: 替换 any 为具体类型
              const MenuButton = React.forwardRef<
                HTMLButtonElement, 
                React.ComponentProps<typeof SidebarMenuButton>
              >((props, ref) => {
                const ButtonContent = (
                  <SidebarMenuButton 
                    ref={ref}
                    // 修复点 2: 将 null 改为 undefined
                    tooltip={state === "collapsed" && !hasSubmenu ? item.title : undefined}
                    isActive={isActive}
                    {...props}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {state === "expanded" && hasSubmenu && (
                      <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    )}
                  </SidebarMenuButton>
                );

                if (item.url && item.url !== "#") {
                  return <Link href={item.url} className="w-full">{ButtonContent}</Link>;
                }
                return ButtonContent;
              });
              MenuButton.displayName = "MenuButton";

              if (state === "collapsed") {
                if (hasSubmenu) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <HoverCard openDelay={100} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          <div><MenuButton /></div>
                        </HoverCardTrigger>
                        <HoverCardContent 
                          side="right" 
                          align="start" 
                          className="min-w-56 p-2 bg-white border shadow-lg rounded-lg z-[100]"
                        >
                           <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b mb-1">
                              {item.title}
                           </div>
                           <div className="flex flex-col gap-1">
                             {item.items!.map(sub => (
                               <Link 
                                 key={sub.title} 
                                 href={sub.url}
                                 className={`
                                   block px-2 py-1.5 text-sm rounded-md transition-colors hover:bg-slate-100
                                   ${pathname === sub.url ? "bg-slate-100 font-medium text-primary" : ""}
                                 `}
                               >
                                 {sub.title}
                               </Link>
                             ))}
                           </div>
                        </HoverCardContent>
                      </HoverCard>
                    </SidebarMenuItem>
                  );
                }
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <MenuButton />
                  </SidebarMenuItem>
                );
              }

              if (hasSubmenu) {
                return (
                  <Collapsible
                    key={item.title}
                    asChild
                    defaultOpen={isActive}
                    className="group/collapsible"
                  >
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <MenuButton /> 
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {item.items!.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={pathname === subItem.url}>
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
              }

              return (
                <SidebarMenuItem key={item.title}>
                  <MenuButton />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      
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
                <DropdownMenuItem onClick={() => logoutAction()}>
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