import type { Metadata } from "next";
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
  // 受保护路径的鉴权重定向由 proxy.ts 完成；此处只负责把 session 注入 AuthProvider
  const session = await auth.getSession();

  return (
    <AuthProvider
      initialSession={session}
      actions={auth.actions}
    >
      <ClientShell>{children}</ClientShell>
    </AuthProvider>
  );
}
