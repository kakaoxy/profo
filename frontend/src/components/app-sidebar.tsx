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
  Smartphone,
  Settings,
  LucideIcon,
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

interface NavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  isActive?: boolean;
  items?: { title: string; url: string }[];
}

const data: { navMain: NavItem[] } = {
  navMain: [
    {
      title: "工作台",
      url: "/",
      icon: LayoutDashboard,
      isActive: true,
    },
    {
      title: "市场情报",
      url: "#",
      icon: Building2,
      items: [
        { title: "房源列表", url: "/properties" },
        { title: "批量上传", url: "/properties/upload" },
        { title: "数据治理", url: "/properties/governance" },
      ],
    },
    {
      title: "线索中心",
      url: "/leads",
      icon: PhoneIncoming,
    },
    {
      title: "项目管理",
      url: "/projects",
      icon: FolderKanban,
    },
    {
      title: "房源营销",
      url: "/l4-marketing/projects",
      icon: Smartphone,
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
    {
      title: "设置",
      url: "#",
      icon: Settings,
      items: [
        { title: "API Key", url: "/settings/api-key" },
      ],
    },
  ],
};

interface MenuButtonProps {
  item: NavItem;
  isActive: boolean | undefined;
  state: "expanded" | "collapsed";
  hasSubmenu: boolean | undefined;
}

const MenuButton = React.forwardRef<
  HTMLButtonElement,
  MenuButtonProps & Omit<React.ComponentProps<typeof SidebarMenuButton>, "isActive" | "tooltip">
>(({ item, isActive, state, hasSubmenu, ...props }, ref) => {
  const Icon = item.icon;
  const buttonContent = (
    <SidebarMenuButton
      ref={ref}
      tooltip={state === "collapsed" && !hasSubmenu ? item.title : undefined}
      isActive={isActive}
      className={`
        rounded-lg px-3 py-2.5 transition-all duration-200
        ${isActive
          ? "bg-muted text-foreground font-medium shadow-sm"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }
      `}
      {...props}
    >
      <Icon
        className={`h-5 w-5 ${isActive ? "text-foreground" : "text-muted-foreground"}`}
        strokeWidth={isActive ? 2 : 1.5}
      />
      <span className="text-sm tracking-tight">{item.title}</span>
      {state === "expanded" && hasSubmenu && (
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
      )}
    </SidebarMenuButton>
  );

  if (item.url && item.url !== "#" && !hasSubmenu) {
    return (
      <Link href={item.url} className="w-full">
        {buttonContent}
      </Link>
    );
  }
  return buttonContent;
});
MenuButton.displayName = "MenuButton";

export function AppSidebar({ user }: { user: User | null }) {
  const { state, isMobile, setOpen } = useSidebar();
  const pathname = usePathname();

  // 进入非首页的功能页面时自动折叠侧边栏
  React.useEffect(() => {
    // 定义需要自动折叠的页面路径
    const autoCollapsePaths = [
      "/properties",
      "/leads",
      "/projects",
      "/l4-marketing",
      "/users",
      "/settings",
    ];

    // 检查当前路径是否匹配需要折叠的页面（首页除外）
    const shouldCollapse = pathname !== "/" &&
      autoCollapsePaths.some(path => pathname.startsWith(path));

    if (shouldCollapse && !isMobile) {
      setOpen(false);
    }
  }, [pathname, setOpen, isMobile]);

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-0 bg-card/80 backdrop-blur-xl"
    >
      {/* Apple-style Header */}
      <SidebarHeader className="border-b border-border">
        <div className={`flex items-center py-3 ${state === "collapsed" ? "justify-center px-0" : "px-3"}`}>
          {state === "expanded" ? (
            <div className="flex items-center gap-2.5 transition-all">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-card to-muted text-white font-bold text-xs shadow-sm">
                P
              </div>
              <span className="truncate font-semibold text-[15px] text-foreground tracking-tight">
                Profo
              </span>
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-card to-muted text-white font-bold text-xs shadow-sm">
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

              if (state === "collapsed") {
                if (hasSubmenu) {
                  return (
                    <SidebarMenuItem key={item.title}>
                      <HoverCard openDelay={100} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          <div>
                            <MenuButton item={item} isActive={isActive} state={state} hasSubmenu={hasSubmenu} />
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          className="min-w-52 p-1.5 bg-card/95 backdrop-blur-xl border border-border shadow-xl rounded-xl z-100"
                        >
                          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
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
                                    ? "bg-muted font-medium text-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    <MenuButton item={item} isActive={isActive} state={state} hasSubmenu={hasSubmenu} />
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
                        <MenuButton item={item} isActive={isActive} state={state} hasSubmenu={hasSubmenu} />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub className="ml-5 mt-1 border-l border-border pl-3 space-y-1">
                          {item.items!.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={pathname === subItem.url}
                                className={`
                                  rounded-md px-3 py-2 text-sm transition-all duration-150
                                  ${pathname === subItem.url
                                    ? "bg-muted text-foreground font-medium"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                  <MenuButton item={item} isActive={isActive} state={state} hasSubmenu={hasSubmenu} />
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Apple-style Footer */}
      <SidebarFooter className={`border-t border-border ${state === "collapsed" ? "px-0 py-2" : "p-2"}`}>
        {/* 折叠/展开按钮 */}
        <div className={`pb-2 mb-2 border-b border-border flex ${state === "collapsed" ? "justify-center" : "justify-end"}`}>
          <SidebarTrigger className="text-muted-foreground hover:text-foreground h-8 w-8 rounded-lg hover:bg-muted transition-colors" />
        </div>
        {/* 用户头像 */}
        <div className={state === "collapsed" ? "flex justify-center" : ""}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={`flex items-center rounded-xl py-2 hover:bg-muted transition-all duration-200 ${state === "collapsed" ? "justify-center w-8 h-8 mx-auto" : "w-full px-3 gap-3"}`}
              >
                <Avatar className="h-8 w-8 rounded-full ring-2 ring-border shrink-0">
                  <AvatarImage
                    src={user?.avatar || ""}
                    alt={user?.username}
                  />
                  <AvatarFallback className="rounded-full bg-gradient-to-br from-muted to-muted/80 text-foreground text-xs font-medium">
                    {user?.username?.slice(0, 2).toUpperCase() || "AD"}
                  </AvatarFallback>
                </Avatar>
                {state === "expanded" && (
                  <>
                    <div className="grid flex-1 text-left leading-tight">
                      <span className="truncate font-medium text-[13px] text-foreground">
                        {user?.nickname || user?.username}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {user?.role?.name || "管理员"}
                      </span>
                    </div>
                    <MoreHorizontal className="ml-auto h-4 w-4 text-muted-foreground" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="min-w-52 rounded-xl bg-card/95 backdrop-blur-xl border border-border shadow-xl p-1"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={8}
            >
              <div className="px-2.5 py-2 border-b border-border mb-1">
                <p className="text-[13px] font-medium text-foreground">{user?.nickname || user?.username}</p>
                <p className="text-[11px] text-muted-foreground">{user?.role?.name || "管理员"}</p>
              </div>
              <DropdownMenuSeparator className="hidden" />
              <DropdownMenuItem
                onClick={() => logoutAction()}
                className="rounded-lg px-2.5 py-2 text-error dark:text-error hover:bg-error-container dark:hover:bg-error/20 focus:bg-error-container dark:focus:bg-red-900/20 cursor-pointer"
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
