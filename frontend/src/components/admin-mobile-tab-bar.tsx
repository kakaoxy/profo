"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, PhoneIncoming, MoreHorizontal } from "lucide-react";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { usePermission } from "@/hooks/use-permission";
import { AdminMobileMenuSheet } from "@/app/(main)/_components/admin-mobile-menu-sheet";

// Tab 定义：底部固定显示的 3 个主菜单 + "更多"
const tabs = [
  { label: "工作台", href: "/admin", icon: LayoutDashboard },
  {
    label: "房源",
    href: "/admin/properties",
    icon: Building2,
    permission: PERMISSION_CODES.PROPERTY_READ,
  },
  {
    label: "线索",
    href: "/admin/leads",
    icon: PhoneIncoming,
    permission: PERMISSION_CODES.LEAD_READ,
  },
] as const;

export function AdminMobileTabBar() {
  const pathname = usePathname();
  const { hasPermission } = usePermission();
  const [moreOpen, setMoreOpen] = useState(false);

  // tabs 是模块级常量，依赖 hasPermission 稳定后即可 memoize
  const visibleTabs = useMemo(
    () => tabs.filter((t) => !("permission" in t) || hasPermission(t.permission)),
    [hasPermission],
  );

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-50 h-16 border-t border-border bg-card/95 backdrop-blur-xl md:hidden pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex h-full max-w-150 items-center justify-around px-2">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-1 min-w-14 py-1"
              >
                <Icon
                  className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`}
                  strokeWidth={active ? 2.2 : 1.5}
                />
                <span
                  className={`text-xs ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
          {/* "更多" Tab：触发底部 Sheet 展示其余菜单 */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="更多菜单"
            className="flex flex-col items-center justify-center gap-1 min-w-14 py-1"
          >
            <MoreHorizontal
              className={`h-5 w-5 ${moreOpen ? "text-primary" : "text-muted-foreground"}`}
              strokeWidth={moreOpen ? 2.2 : 1.5}
            />
            <span
              className={`text-xs ${moreOpen ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              更多
            </span>
          </button>
        </div>
      </nav>
      <AdminMobileMenuSheet open={moreOpen} onOpenChange={setMoreOpen} />
    </>
  );
}
