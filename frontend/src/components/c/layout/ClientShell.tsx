"use client";

import { usePathname } from "next/navigation";
import { TopAppBar } from "@/components/c/layout/TopAppBar";
import { BottomNavBar } from "@/components/c/layout/BottomNavBar";
import { SiteFooter } from "@/components/c/layout/SiteFooter";

const TITLE_MAP: Record<string, string> = {
  "/about": "服务介绍",
  "/contact": "成交案例",
  "/valuation": "卖房估价",
  "/login": "登录",
  "/register": "注册",
  "/profile": "编辑资料",
};

const BOTTOM_NAV_VISIBLE_PATHS = new Set(["/", "/my", "/about", "/contact"]);
const AUTH_PATHS = new Set(["/login", "/register"]);

export default function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isProjectDetail = /^\/projects\/[^/]+$/.test(pathname);
  const isAuthPage = AUTH_PATHS.has(pathname);

  const isMainRoute = pathname === "/" || pathname === "/my";
  const topBarVariant = isMainRoute ? "main" : "back";

  const topBarTitle =
    TITLE_MAP[pathname] ??
    (isProjectDetail ? "房源详情" : pathname.match(/^\/leads\/[^/]+$/) ? "估价详情" : "");

  const bottomNavVisible = BOTTOM_NAV_VISIBLE_PATHS.has(pathname);

  // Auth pages: full-screen split layout on desktop, standard mobile layout
  if (isAuthPage) {
    return (
      <div className="min-h-dvh bg-fog">
        {/* Mobile: show TopAppBar; Desktop: hide it */}
        <div className="md:hidden">
          <TopAppBar variant={topBarVariant} title={topBarTitle} />
        </div>
        <main className="md:min-h-dvh">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-fog">
      {!isProjectDetail && <TopAppBar variant={topBarVariant} title={topBarTitle} />}
      <main className={`${isProjectDetail ? "" : "pt-16 md:pt-0"}`}>{children}</main>
      <SiteFooter />
      <BottomNavBar visible={bottomNavVisible} />
    </div>
  );
}
