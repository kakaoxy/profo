import type { Metadata } from "next";
import ClientShell from "@/components/c/layout/ClientShell";
import { CUserProvider } from "@/lib/api-c/user-context";
import { getCurrentCUser } from "@/lib/api-c/server";
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
  // 服务端鉴权：调 GET /public/auth/me 获取当前用户信息（401 → null，不重定向）
  // 受保护路径的鉴权重定向由 proxy.ts 完成；此处只负责把用户信息注入 Context
  const user = await getCurrentCUser();

  return (
    <CUserProvider user={user}>
      <ClientShell>{children}</ClientShell>
    </CUserProvider>
  );
}
