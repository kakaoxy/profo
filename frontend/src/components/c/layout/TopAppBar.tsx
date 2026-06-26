"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useUserInfo } from "@/lib/api-c/user-info";

interface TopAppBarProps {
  variant: "main" | "back";
  title?: string;
  onBack?: () => void;
  actionIcon?: React.ReactNode;
}

const NAV_LINKS = [
  { label: "房源", href: "/", activeFor: ["/", "/projects", "/contact"] },
  { label: "估价", href: "/valuation", activeFor: ["/valuation"] },
  { label: "关于我们", href: "/about", activeFor: ["/about"] },
] as const;

export function TopAppBar({
  variant,
  title,
  onBack,
  actionIcon,
}: TopAppBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const userInfo = useUserInfo();
  const isLoggedIn = !!userInfo.nickname;

  const handleBack = () => {
    if (onBack) onBack();
    else router.back();
  };

  return (
    <>
      {/* Desktop: sticky nav with links + auth */}
      <header className="hidden md:sticky md:top-0 md:inset-x-0 md:z-50 md:block md:h-20 md:border-b md:border-dove/30 md:bg-white">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-6">
          <Link
            href="/"
            className="text-[28px] font-semibold leading-none tracking-tight text-ink"
          >
            Profo
          </Link>

          <nav className="flex items-center gap-8">
            {NAV_LINKS.map((link) => {
              const isActive = link.activeFor.some(
                (p) => pathname === p || pathname.startsWith(`${p}/`)
              );
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`relative py-1 text-[16px] transition-colors ${
                    isActive
                      ? "font-medium text-ink"
                      : "text-graphite hover:text-ink"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <span className="absolute inset-x-0 bottom-[-2px] h-[2px] rounded-full bg-ink" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                href="/my"
                className="inline-flex items-center gap-2 rounded-lg bg-fog px-4 py-2.5 text-[15px] font-medium text-ink transition-colors hover:bg-dove/20"
              >
                个人中心
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-lg bg-ink px-4 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-ink/90"
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile: compact bar */}
      <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-dove/30 bg-white/90 backdrop-blur md:hidden">
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between px-4">
          {variant === "main" ? (
            <>
              <div className="w-10" />
              <Link
                href="/"
                className="text-lg font-medium tracking-tight text-ink"
                aria-label="Profo 首页"
              >
                Profo
              </Link>
              <div className="w-10" />
            </>
          ) : (
            <>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink hover:bg-fog transition-colors"
                onClick={handleBack}
                aria-label="返回上一页"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <span className="text-base font-medium text-ink">
                {title ?? ""}
              </span>
              <div className="flex h-10 w-10 items-center justify-center">
                {actionIcon ?? null}
              </div>
            </>
          )}
        </div>
      </header>
    </>
  );
}
