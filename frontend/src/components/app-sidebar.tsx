"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, MoreHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { logoutAction } from "@/app/admin/login/actions";
import { usePermission } from "@/hooks/use-permission";
import { navMain, NavItem } from "@/lib/admin-nav-data";

interface User {
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  role?: {
    name: string;
    code?: string;
  };
}

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
        rounded-xl px-3 py-2 text-[14.5px] font-[450] transition-colors duration-150
        ${
          isActive
            ? "bg-pure-white text-ink font-medium shadow-steep-sm"
            : "text-ink hover:bg-ink/5"
        }
      `}
      {...props}
    >
      <Icon
        className={`h-[18px] w-[18px] ${isActive ? "text-ink" : "text-graphite"}`}
        strokeWidth={1.7}
      />
      <span className="text-sm tracking-tight">{item.title}</span>
      {state === "expanded" && hasSubmenu && (
        <ChevronRight className="ml-auto h-4 w-4 text-dove transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
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
  const roleCode = user?.role?.code;
  const { hasPermission } = usePermission();

  // 可见性判断：permission 优先（用 hasPermission 校验），未声明 permission 时回退到 roles 判断；
  // 两者都未声明则对所有后台角色可见。
  const isVisible = (item: { permission?: string; roles?: string[] }) => {
    if (item.permission) {
      return hasPermission(item.permission);
    }
    if (item.roles) {
      return roleCode != null && item.roles.includes(roleCode);
    }
    return true;
  };

  // 进入非首页的功能页面时自动折叠侧边栏
  React.useEffect(() => {
    // 定义需要自动折叠的页面路径
    const autoCollapsePaths = [
      "/admin/properties",
      "/admin/leads",
      "/admin/projects",
      "/admin/marketing",
      "/admin/investments",
      "/admin/ledger",
      "/admin/growth-center",
      "/admin/users",
      "/admin/audit-logs",
      "/admin/settings",
    ];

    // 检查当前路径是否匹配需要折叠的页面（首页除外）
    const shouldCollapse =
      pathname !== "/admin" && autoCollapsePaths.some((path) => pathname.startsWith(path));

    if (shouldCollapse && !isMobile) {
      setOpen(false);
    }
    // 注意：依赖里不能加 setOpen。SidebarProvider 中 setOpen 的 useCallback 依赖
    // open，每次展开/折叠都会生成新引用；一旦加入依赖，本 effect 会在用户点击
    // 展开按钮后立即重新执行，把侧边栏重新折叠回去，表现为"折叠/展开按钮失效"
    // （仅 autoCollapsePaths 命中的子页面，/admin 不受影响）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, isMobile]);

  // 按权限/角色过滤一级菜单与子菜单
  const visibleNav = navMain
    .filter((item) => isVisible(item))
    .map((item) => ({
      ...item,
      items: item.items?.filter((sub) => isVisible(sub)),
    }))
    .filter((item) => !item.items || item.items.length > 0);

  return (
    <Sidebar collapsible="icon" className="border-r-0 bg-fog">
      {/* Steep Header：Ink 方块 Logo + 无描边 */}
      <SidebarHeader>
        <div
          className={`flex items-center py-3 ${state === "collapsed" ? "justify-center px-0" : "px-3"}`}
        >
          {state === "expanded" ? (
            <div className="flex items-center gap-2.5 transition-all">
              <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-ink text-[15px] font-semibold text-white">
                P
              </div>
              <span className="truncate text-[16px] font-medium text-ink tracking-tight">
                Profo
              </span>
            </div>
          ) : (
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-ink text-[15px] font-semibold text-white">
              P
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarMenu className="gap-1">
            {visibleNav.map((item, idx) => {
              const hasSubmenu = item.items && item.items.length > 0;
              const isActive =
                pathname === item.url || item.items?.some((sub) => pathname.startsWith(sub.url));

              // 分组导航标签：section 与前一项不同时输出组名（折叠态隐藏）
              const prevSection = idx > 0 ? visibleNav[idx - 1].section : undefined;
              const showGroupLabel = !!item.section && item.section !== prevSection;

              if (state === "collapsed") {
                if (hasSubmenu) {
                  const hasDirectUrl = item.url && item.url !== "#";
                  const node = (
                    <SidebarMenuItem key={item.title}>
                      <HoverCard openDelay={100} closeDelay={200}>
                        <HoverCardTrigger asChild>
                          {hasDirectUrl ? (
                            <Link href={item.url} className="w-full">
                              <MenuButton
                                item={item}
                                isActive={isActive}
                                state={state}
                                hasSubmenu={hasSubmenu}
                              />
                            </Link>
                          ) : (
                            <div>
                              <MenuButton
                                item={item}
                                isActive={isActive}
                                state={state}
                                hasSubmenu={hasSubmenu}
                              />
                            </div>
                          )}
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          className="min-w-52 p-1.5 bg-pure-white rounded-cards shadow-steep z-50"
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
                                  block px-3 py-2.5 text-[13.5px] rounded-[10px] transition-colors duration-150
                                  ${
                                    pathname === sub.url
                                      ? "font-medium text-rust"
                                      : "text-ash hover:text-ink"
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

                  return <React.Fragment key={item.title}>{node}</React.Fragment>;
                }

                const node = (
                  <SidebarMenuItem key={item.title}>
                    <MenuButton
                      item={item}
                      isActive={isActive}
                      state={state}
                      hasSubmenu={hasSubmenu}
                    />
                  </SidebarMenuItem>
                );

                return <React.Fragment key={item.title}>{node}</React.Fragment>;
              }

              let node: React.ReactNode;
              if (hasSubmenu) {
                const hasDirectUrl = item.url && item.url !== "#";

                // 有直接跳转 URL：hover 弹出 + 点击跳转
                if (hasDirectUrl) {
                  node = (
                    <SidebarMenuItem key={item.title}>
                      <HoverCard openDelay={150} closeDelay={250}>
                        <HoverCardTrigger asChild>
                          <Link href={item.url} className="w-full">
                            <MenuButton
                              item={item}
                              isActive={isActive}
                              state={state}
                              hasSubmenu={hasSubmenu}
                            />
                          </Link>
                        </HoverCardTrigger>
                        <HoverCardContent
                          side="right"
                          align="start"
                          sideOffset={8}
                          className="min-w-52 p-1.5 bg-pure-white rounded-cards shadow-steep z-100"
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
                                  block px-3 py-2.5 text-[13.5px] rounded-[10px] transition-colors duration-150
                                  ${
                                    pathname === sub.url
                                      ? "font-medium text-rust"
                                      : "text-ash hover:text-ink"
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
                } else {
                  // 无直接跳转 URL：保持 Collapsible 展开/折叠
                  node = (
                    <Collapsible
                      key={item.title}
                      asChild
                      defaultOpen={isActive}
                      className="group/collapsible"
                    >
                      <SidebarMenuItem>
                        <CollapsibleTrigger asChild>
                          <MenuButton
                            item={item}
                            isActive={isActive}
                            state={state}
                            hasSubmenu={hasSubmenu}
                          />
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub className="ml-5 mt-1 border-l border-dove/30 pl-3 space-y-1">
                            {item.items!.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton
                                  asChild
                                  isActive={pathname === subItem.url}
                                  className={`
                                  rounded-[10px] px-3 py-1.5 text-[13.5px] transition-colors duration-150
                                  ${
                                    pathname === subItem.url
                                      ? "text-rust font-medium"
                                      : "text-ash hover:text-ink"
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
              } else {
                node = (
                  <SidebarMenuItem key={item.title}>
                    <MenuButton
                      item={item}
                      isActive={isActive}
                      state={state}
                      hasSubmenu={hasSubmenu}
                    />
                  </SidebarMenuItem>
                );
              }

              return (
                <React.Fragment key={item.title}>
                  {showGroupLabel ? (
                    <div
                      aria-hidden="true"
                      className="px-3 pb-1 pt-4 text-xs font-medium tracking-[0.06em] text-graphite group-data-[collapsible=icon]:hidden"
                    >
                      {item.section}
                    </div>
                  ) : null}
                  {node}
                </React.Fragment>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Steep Footer：发丝线分隔 + 折叠按钮 + 用户区 */}
      <SidebarFooter
        className={`border-t border-dove/25 ${state === "collapsed" ? "px-0 py-2" : "p-2"}`}
      >
        {/* 折叠/展开按钮 */}
        <div
          className={`pb-2 mb-2 border-b border-dove/25 flex ${state === "collapsed" ? "justify-center" : "justify-end"}`}
        >
          <SidebarTrigger className="text-graphite hover:text-ink h-8 w-8 rounded-xl hover:bg-ink/5 transition-colors" />
        </div>
        {/* 用户头像 */}
        <div className={state === "collapsed" ? "flex justify-center" : ""}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                suppressHydrationWarning
                className={`flex items-center rounded-xl py-2 hover:bg-ink/5 transition-all duration-200 ${state === "collapsed" ? "justify-center w-8 h-8 mx-auto" : "w-full px-3 gap-3"}`}
              >
                <Avatar className="h-8 w-8 rounded-full shrink-0">
                  <AvatarImage src={user?.avatar || ""} alt={user?.username} />
                  <AvatarFallback className="rounded-full bg-sky-wash text-ink text-xs font-medium">
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
              className="min-w-52 rounded-xl bg-pure-white shadow-steep p-1"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={8}
            >
              <div className="px-2.5 py-2 border-b border-border mb-1">
                <p className="text-[13px] font-medium text-foreground">
                  {user?.nickname || user?.username}
                </p>
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
