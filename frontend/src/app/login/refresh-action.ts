"use server";

import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * 使用 refresh_token 刷新 access_token
 * 
 * @returns 刷新是否成功
 */
export async function refreshTokenAction(): Promise<boolean> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    console.warn("🔁 [Token刷新] 无 refresh_token，无法刷新");
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.error("🔁 [Token刷新] 刷新失败，状态码:", response.status);
      // 刷新失败，清除所有 token
      cookieStore.delete("access_token");
      cookieStore.delete("refresh_token");
      return false;
    }

    const data: RefreshResponse = await response.json();

    // 更新 cookies
    cookieStore.set("access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in,
      sameSite: "lax",
    });

    cookieStore.set("refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "lax",
    });

    console.log("✅ [Token刷新] 成功刷新 access_token");
    return true;
  } catch (error) {
    console.error("🔁 [Token刷新] 网络错误:", error);
    return false;
  }
}
