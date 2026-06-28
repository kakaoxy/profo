"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Home, Info, ClipboardCheck, User } from "lucide-react";

const tabs = [
  { label: "房源", href: "/", icon: Home },
  { label: "服务", href: "/about", icon: Info },
  { label: "估价", href: "/valuation", icon: ClipboardCheck },
  { label: "我的", href: "/my", icon: User },
] as const;

interface BottomNavBarProps {
  visible: boolean;
}

export function BottomNavBar({ visible }: BottomNavBarProps) {
  const pathname = usePathname();

  if (!visible) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-50 h-20 border-t border-dove/30 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex h-full max-w-[1200px] items-center justify-around px-2">
        {tabs.map((tab) => {
          const isActive =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className="flex flex-col items-center justify-center gap-1 min-w-[56px]"
            >
              <Icon
                className={`h-5 w-5 ${
                  isActive ? "text-rust" : "text-graphite"
                }`}
              />
              <span
                className={`text-xs ${
                  isActive
                    ? "font-medium text-ink"
                    : "text-graphite"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
