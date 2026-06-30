"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPaths, getApiUrl } from "@/lib/config";
import { auth } from "@/auth";
import { ActionResult, createErrorResult } from "@/lib/action-result";

interface RegisterTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    nickname?: string | null;
    phone?: string | null;
  };
}

interface RegisterPayload {
  username: string;
  password: string;
  nickname?: string;
  phone?: string;
}

export async function registerAction(
  _: ActionResult<{ user: unknown }>,
  formData: FormData,
): Promise<ActionResult<{ user: unknown }>> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;
  const nickname = formData.get("nickname") as string;
  const phone = formData.get("phone") as string;

  if (!username || !password) {
    return createErrorResult("请输入账号和密码");
  }

  const payload: RegisterPayload = { username, password };
  if (nickname) payload.nickname = nickname;
  if (phone) payload.phone = phone;

  try {
    const response = await fetch(getApiUrl(apiPaths.cAuth.register), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg =
        errorData.detail ||
        errorData.error?.message ||
        errorData.message ||
        "注册失败";
      return createErrorResult(errorMsg);
    }

    const data: RegisterTokenResponse = await response.json();

    // 直接写入 library 管理的 cookie 名（c_access_token / c_refresh_token）
    // 跳过 library 内部 setTokenCookies 是为了复用 register API 已返回的 token，
    // 避免再调一次 /public/auth/token 浪费请求
    const cookieStore = await cookies();
    const cookieNames = auth.config.cookieNames;
    const baseOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax" as const,
    };

    cookieStore.set(cookieNames.accessToken, data.access_token, {
      ...baseOptions,
      maxAge: data.expires_in,
    });
    cookieStore.set(cookieNames.refreshToken, data.refresh_token, {
      ...baseOptions,
      maxAge: 60 * 60 * 24 * 7,
    });
  } catch {
    return createErrorResult("网络错误，请连接后端服务");
  }

  redirect("/");
}
