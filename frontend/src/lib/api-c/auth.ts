"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPaths, getApiUrl } from "@/lib/config";
import { ActionResult, createErrorResult } from "@/lib/action-result";

interface UserInfo {
  nickname: string | null;
  phone: string | null;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    nickname?: string | null;
    phone?: string | null;
  };
}

function setUserInfoCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, user: { nickname?: string | null; phone?: string | null }, maxAge: number) {
  const info: UserInfo = {
    nickname: user.nickname ?? null,
    phone: user.phone ?? null,
  };
  cookieStore.set("c_user_info", JSON.stringify(info), {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
    sameSite: "lax",
  });
}

interface RegisterPayload {
  username: string;
  password: string;
  nickname?: string;
  phone?: string;
}

export async function registerAction(_: ActionResult<{ user: unknown }>, formData: FormData): Promise<ActionResult<{ user: unknown }>> {
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
      const errorMsg = errorData.detail || errorData.error?.message || errorData.message || "注册失败";
      return createErrorResult(errorMsg);
    }

    const data = await response.json();

    const cookieStore = await cookies();
    cookieStore.set("c_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in,
      sameSite: "lax",
    });

    cookieStore.set("c_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });

    setUserInfoCookie(cookieStore, data.user, data.expires_in);
  } catch {
    return createErrorResult("网络错误，请连接后端服务");
  }

  redirect("/c");
}

export async function loginAction(_: ActionResult<null>, formData: FormData): Promise<ActionResult<null>> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return createErrorResult("请输入账号和密码");
  }

  try {
    const response = await fetch(getApiUrl(apiPaths.cAuth.login), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.error?.message || errorData.message || "登录失败";
      return createErrorResult(errorMsg);
    }

    const data: TokenResponse = await response.json();

    const cookieStore = await cookies();
    cookieStore.set("c_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in,
      sameSite: "lax",
    });

    cookieStore.set("c_refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });

    setUserInfoCookie(cookieStore, data.user, data.expires_in);
  } catch {
    return createErrorResult("网络错误，请连接后端服务");
  }

  const redirectTo = (formData.get("redirect") as string) || "/c";
  redirect(redirectTo);
}

export async function logoutAction(): Promise<ActionResult<null>> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("c_access_token")?.value;

    if (token) {
      await fetch(getApiUrl(apiPaths.cAuth.logout), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    }

    cookieStore.delete("c_access_token");
    cookieStore.delete("c_refresh_token");
    cookieStore.delete("c_user_info");
  } catch {
    const cookieStore = await cookies();
    cookieStore.delete("c_access_token");
    cookieStore.delete("c_refresh_token");
    cookieStore.delete("c_user_info");
  }

  redirect("/c");
}
