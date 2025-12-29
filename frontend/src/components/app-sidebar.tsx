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
  DropdownMenuSeparator,
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
    <Sidebar 
      collapsible="icon" 
      className="border-r-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl"
    >
      {/* Apple-style Header */}
      <SidebarHeader className="border-b border-slate-200/60 dark:border-slate-800/60">
        <div className={`flex items-center py-3 ${state === "collapsed" ? "justify-center px-0" : "px-3"}`}>
          {state === "expanded" ? (
            <div className="flex items-center gap-2.5 transition-all">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 dark:from-white dark:to-slate-200 text-white dark:text-slate-900 font-bold text-xs shadow-sm">
                P
              </div>
              <span className="truncate font-semibold text-[15px] text-slate-800 dark:text-white tracking-tight">
                Profo
              </span>
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-600 dark:from-white dark:to-slate-200 text-white dark:text-slate-900 font-bold text-xs shadow-sm">
              P
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {data.navMain.map((item) => {
              const hasSubmenu = item.items && item.items.length > 0;
              const isActive =
                pathname === item.url ||
                item.items?.some((sub) => pathname.startsWith(sub.url));

              const MenuButton = React.forwardRef<
                HTMLButtonElement,
                React.ComponentProps<typeof SidebarMenuButton>
              >((props, ref) => {
                const ButtonContent = (
                  <SidebarMenuButton
                    ref={ref}
                    tooltip={
                      state === "collapsed" && !hasSubmenu
                        ? item.title
                        : undefined
                    }
                    isActive={isActive}
                    className={`
                      rounded-lg px-3 py-2.5 transition-all duration-200
                      ${isActive 
                        ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium shadow-sm" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                      }
                    `}
                    {...props}
                  >
                    {item.icon && (
                      <item.icon 
                        className={`h-5 w-5 ${isActive ? "text-slate-800 dark:text-white" : "text-slate-500 dark:text-slate-400"}`} 
                        strokeWidth={isActive ? 2 : 1.5}
                      />
                    )}
                    <span className="text-sm tracking-tight">{item.title}</span>
                    {state === "expanded" && hasSubmenu && (
                      <ChevronRight className="ml-auto h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                    )}
                  </SidebarMenuButton>
                );

                if (item.url && item.url !== "#") {
                  return (
                    <Link href={item.url} className="w-full">
                      {ButtonContent}
                    </Link>
                  );
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
                          <div>
                            <MenuButton />
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          className="min-w-52 p-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl rounded-xl z-[100]"
                        >
                          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                            {item.title}
                          </div>
                          <div className="flex flex-col gap-1 mt-1">
                            {item.items!.map((sub) => (
                              <Link
                                key={sub.title}
                                href={sub.url}
                                className={`
                                  block px-3 py-2.5 text-sm rounded-lg transition-all duration-150
                                  ${pathname === sub.url
                                    ? "bg-slate-100 dark:bg-slate-800 font-medium text-slate-900 dark:text-white"
                                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white"
                                  }
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
                        <SidebarMenuSub className="ml-5 mt-1 border-l border-slate-200/60 dark:border-slate-700/60 pl-3 space-y-1">
                          {item.items!.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === subItem.url}
                                className={`
                                  rounded-md px-3 py-2 text-sm transition-all duration-150
                                  ${pathname === subItem.url
                                    ? "bg-slate-100/80 dark:bg-slate-800/80 text-slate-900 dark:text-white font-medium"
                                    : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-800 dark:hover:text-white"
                                  }
                                `}
                              >
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

      {/* Apple-style Footer */}
      <SidebarFooter className={`border-t border-slate-200/60 dark:border-slate-800/60 ${state === "collapsed" ? "px-0 py-2" : "p-2"}`}>
        {/* 折叠/展开按钮 */}
        <div className={`pb-2 mb-2 border-b border-slate-200/60 dark:border-slate-800/60 flex ${state === "collapsed" ? "justify-center" : "justify-end"}`}>
          <SidebarTrigger className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white h-8 w-8 rounded-lg hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-colors" />
        </div>
        {/* 用户头像 */}
        <div className={state === "collapsed" ? "flex justify-center" : ""}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center rounded-xl py-2 hover:bg-slate-100/80 dark:hover:bg-slate-800/50 transition-all duration-200 ${state === "collapsed" ? "justify-center w-8 h-8 mx-auto" : "w-full px-3 gap-3"}`}
              >
                <Avatar className="h-8 w-8 rounded-full ring-2 ring-slate-200/60 dark:ring-slate-700/60 flex-shrink-0">
                  <AvatarImage
                    src={user?.avatar || ""}
                    alt={user?.username}
                  />
                  <AvatarFallback className="rounded-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 text-slate-700 dark:text-slate-200 text-xs font-medium">
                    {user?.username?.slice(0, 2).toUpperCase() || "AD"}
                  </AvatarFallback>
                </Avatar>
                {state === "expanded" && (
                  <>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-medium text-[13px] text-slate-800 dark:text-white">
                        {user?.nickname || user?.username}
                      </span>
                      <span className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {user?.role?.name || "管理员"}
                      </span>
                    </div>
                    <MoreHorizontal className="ml-auto h-4 w-4 text-slate-400 dark:text-slate-500" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-52 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-1"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={8}
            >
              <div className="px-2.5 py-2 border-b border-slate-100 dark:border-slate-800 mb-1">
                <p className="text-[13px] font-medium text-slate-800 dark:text-white">{user?.nickname || user?.username}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{user?.role?.name || "管理员"}</p>
              </div>
              <DropdownMenuSeparator className="hidden" />
              <DropdownMenuItem 
                onClick={() => logoutAction()}
                className="rounded-lg px-2.5 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20 cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                <span className="text-[13px]">退出登录</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
      <SidebarRail className="after:hidden" />
    </Sidebar>
  );
}
