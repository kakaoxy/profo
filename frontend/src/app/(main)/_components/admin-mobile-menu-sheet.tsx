"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { navMain } from "@/lib/admin-nav-data";
import { usePermission } from "@/hooks/use-permission";

// 已外置到 Tab Bar 的 3 个主菜单（不重复显示）
const HIDDEN_IN_MORE = new Set(["工作台", "房源管理", "线索中心"]);

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
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.url ||
                item.items?.some((sub) => pathname.startsWith(sub.url));
              const href =
                item.url === "#" && item.items
                  ? item.items[0].url
                  : item.url;
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
