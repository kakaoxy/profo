import { redirect } from "next/navigation";
import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export default async function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 已登录用户访问登录页时直接跳转至工作台
  try {
    const client = await fetchClient();
    const { error, response } = await client.GET("/api/v1/auth/me");
    const status = (response as Response | undefined)?.status;
    // 仅当请求成功(无 error)或非 401 错误时认为已登录
    // 401 表示未登录或 token 失效,允许留在登录页
    if (!error && status !== 401) {
      redirect("/admin");
    }
  } catch (e) {
    // 后端不可用时允许显示登录页
    logger.error("登录页鉴权检查失败:", e);
  }

  return <>{children}</>;
}
