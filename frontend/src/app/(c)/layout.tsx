"use client";

import { usePathname } from "next/navigation";
import { TopAppBar } from "@/components/c/layout/TopAppBar";
import { BottomNavBar } from "@/components/c/layout/BottomNavBar";

const TITLE_MAP: Record<string, string> = {
  "/c/about": "服务介绍",
  "/c/contact": "成交案例",
  "/c/valuation": "卖房估价",
  "/c/login": "登录",
  "/c/register": "注册",
  "/c/profile": "编辑资料",
};

const BOTTOM_NAV_VISIBLE_PATHS = new Set(["/c", "/c/my", "/c/about", "/c/contact"]);

export default function CLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isProjectDetail = /^\/c\/projects\/[^/]+$/.test(pathname);

  const isMainRoute = pathname === "/c" || pathname === "/c/my";
  const topBarVariant = isMainRoute ? "main" : "back";

  const topBarTitle =
    TITLE_MAP[pathname] ??
    (isProjectDetail ? "房源详情" : pathname.match(/^\/c\/leads\/[^/]+$/) ? "估价详情" : "");

  const bottomNavVisible = BOTTOM_NAV_VISIBLE_PATHS.has(pathname);

  return (
    <div className="min-h-dvh bg-c-surface">
      {!isProjectDetail && <TopAppBar variant={topBarVariant} title={topBarTitle} />}
      <main className={`mx-auto max-w-[1280px] ${isProjectDetail ? "" : "pt-16"} pb-20`}>{children}</main>
      <BottomNavBar visible={bottomNavVisible} />
    </div>
  );
}
