"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermission } from "@/hooks/use-permission";
import { hasPathPermission } from "@/lib/auth/permissions";

/**
 * 客户端权限守卫组件。
 *
 * 背景：Next.js 16 中 Server Component layout 无法通过 headers() 获取当前
 * pathname（x-invoke-path / x-pathname 已移除），导致服务端权限守卫失效。
 * 本组件在客户端用 usePathname() 获取路径，用 usePermission() 获取权限，
 * 对 PATH_PERMISSION_MAP 中受限路径做客户端重定向。
 *
 * 安全性：后端 API 已基于权限码校验（require_permission），即便客户端守卫
 * 被绕过（禁用 JS），用户也看不到任何数据。客户端守卫仅用于提升用户体验
 * （避免显示空数据页面）。
 *
 * 用法：在 (main)/layout.tsx 中包裹 children。
 */
export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { permissions, isLoading } = usePermission();

  useEffect(() => {
    if (isLoading) return;
    if (!hasPathPermission(pathname, permissions)) {
      router.replace("/admin");
    }
  }, [pathname, permissions, isLoading, router]);

  return <>{children}</>;
}
