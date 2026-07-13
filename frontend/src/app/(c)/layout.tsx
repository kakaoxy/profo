import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import ClientShell from "@/components/c/layout/ClientShell";
import { AuthProvider } from "@/lib/auth/client";
import { auth } from "@/auth";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.home.title,
  description: cLocale.meta.home.description,
  openGraph: {
    title: cLocale.meta.home.title,
    description: cLocale.meta.home.description,
    url: "/",
  },
};

export default async function CLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 服务端解析 session：从 cookie 读取 token，必要时调用 /public/auth/me
  const session = await auth.getSession();

  // 布局级 fail-fast：受保护路径未认证时重定向到登录页
  // 与 proxy.ts 的 PROTECTED_C_PREFIXES 保持一致，形成纵深防御
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? headersList.get("x-invoke-path") ?? "";
  const protectedPrefixes = ["/valuation", "/leads", "/my", "/profile"];
  const isProtected = protectedPrefixes.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
  if (isProtected && !session) {
    redirect(`/login?redirect=${encodeURIComponent(pathname)}`);
  }

  return (
    <AuthProvider
      initialSession={session ? { user: session.user } : null}
      actions={auth.actions}
      hasOAuth={auth.config.providers.length > 0}
    >
      <ClientShell>{children}</ClientShell>
    </AuthProvider>
  );
}
