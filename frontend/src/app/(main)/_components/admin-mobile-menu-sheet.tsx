"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import useSWR from "swr";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { navMain } from "@/lib/admin-nav-data";
import { usePermission } from "@/hooks/use-permission";
import { fetcher } from "@/lib/swr";

// 已外置到 Tab Bar 的 3 个主菜单（不重复显示）
const HIDDEN_IN_MORE = new Set(["工作台", "房源管理", "线索中心"]);

/** 未读响应中最小消费字段（完整类型见 api-types 的 UnreadCountResponse） */
interface UnreadCount {
  total: number;
}

/**
 * 移动端「消息」入口（迭代二降级方案，SPEC §13.2-9）.
 *
 * 桌面端铃铛在 SidebarFooter；移动端侧栏是 Sheet 且当前无任何触发器能打开它
 * （`layout.tsx` 的 `md:hidden` header 只有 logo，Tab Bar 的「更多」是独立 Sheet），
 * 铃铛放进去等于不可达。故按 SPEC 授权的降级口径，把消息中心入口放进「更多」宫格，
 * 并带同样的未读角标（>99 显示 99+，0 不渲染）。
 */
function MobileNotificationTile() {
  const pathname = usePathname();
  const { data } = useSWR<UnreadCount>("/api/v1/notifications/unread-count", fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
    focusThrottleInterval: 30_000,
  });
  const total = data?.total ?? 0;
  const active = pathname === "/admin/notifications" || pathname.startsWith("/admin/notifications/");
  return (
    <Link
      href="/admin/notifications"
      aria-label={total > 0 ? `消息，未读 ${total} 条` : "消息"}
      className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg p-3 transition-colors hover:bg-muted"
    >
      <span className="relative">
        <Bell className={`h-6 w-6 ${active ? "text-primary" : "text-muted-foreground"}`} />
        {total > 0 && (
          <span
            aria-live="polite"
            className="absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground tabular-nums"
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </span>
      <span className="text-center text-xs">消息</span>
    </Link>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 可见性判断（与 AppSidebar.isVisible 严格对齐）：
 * - 优先用 hasPermission 校验 permission 字段
 * - 未声明 permission 时回退到 roles 判断（需 roleCode）
 * - 两者都未声明则对所有后台角色可见
 */
function useIsVisible() {
  const { hasPermission, roleCode } = usePermission();
  return useCallback(
    (item: { permission?: string; roles?: string[] }) => {
      if (item.permission) {
        return hasPermission(item.permission);
      }
      if (item.roles) {
        return roleCode != null && item.roles.includes(roleCode);
      }
      return true;
    },
    [hasPermission, roleCode],
  );
}

export function AdminMobileMenuSheet({ open, onOpenChange }: Props) {
  const pathname = usePathname();
  const isVisible = useIsVisible();

  // 过滤菜单：去掉已外置的 3 个主菜单 + 权限过滤
  // navMain 是模块级常量，依赖 isVisible 稳定后即可 memoize
  const visibleItems = useMemo(
    () =>
      navMain
        .filter((item) => !HIDDEN_IN_MORE.has(item.title))
        .filter(isVisible)
        .map((item) => ({
          ...item,
          items: item.items?.filter(isVisible),
        }))
        .filter((item) => !item.items || item.items.length > 0),
    [isVisible],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] w-full p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-base">更多功能</SheetTitle>
          <SheetDescription>选择要访问的模块</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-4 gap-3">
            {/* 消息入口置顶：桌面端经侧栏铃铛、移动端经此宫格（SPEC §13.2-9 降级） */}
            <MobileNotificationTile />
            {visibleItems.map((item) => {
              const Icon = item.icon;
              // 与侧边栏同口径的高亮判定（子路径点亮父级，避免裸 startsWith 误命中）
              const matchesPath = (target: string) =>
                pathname === target || pathname.startsWith(`${target}/`);
              const isActive =
                matchesPath(item.url) || item.items?.some((sub) => matchesPath(sub.url));
              const href = item.url === "#" && item.items ? item.items[0].url : item.url;
              return (
                <Link
                  key={item.title}
                  href={href}
                  onClick={() => onOpenChange(false)}
                  className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg hover:bg-muted transition-colors"
                >
                  <Icon
                    className={`h-6 w-6 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <span className="text-xs text-center">{item.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
