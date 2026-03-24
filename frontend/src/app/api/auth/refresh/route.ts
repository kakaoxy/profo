import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/config";

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * POST /api/v1/auth/refresh
 *
 * 客户端调用此路由来刷新 Token。
 * 由于 refresh_token 存储在 httpOnly cookie 中，客户端无法直接读取，
 * 所以需要通过这个 API 路由来代理刷新请求。
 *
 * [修复] 改进错误处理和日志记录
 */
export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get("refresh_token")?.value;

  if (!refreshToken) {
    console.warn("🔁 [API Route] 无 refresh_token 可用");
    return NextResponse.json(
      { error: "No refresh token available" },
      { status: 401 }
    );
  }

  try {
    console.log("🔁 [API Route] 向后端请求刷新 token...");

    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("🔁 [API Route] 后端刷新失败:", response.status, errorText);

      // 只有401/403错误才清除 cookies（token确实无效）
      // 500错误保留cookies，可能是临时问题
      if (response.status === 401 || response.status === 403) {
        cookieStore.delete("access_token");
        cookieStore.delete("refresh_token");
        console.log("🔁 [API Route] 已清除无效 cookies");
      }

      return NextResponse.json(
        { error: "Token refresh failed", details: errorText },
        { status: response.status }
      );
    }

    const data: RefreshResponse = await response.json();

    // 更新 cookies
    cookieStore.set("access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in || 36000,
      sameSite: "lax",
    });

    cookieStore.set("refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "lax",
    });

    console.log("✅ [API Route] Token 刷新成功");

    // 返回新的 access_token，让客户端可以使用
    // 注意：refresh_token 仍然是 httpOnly cookie，不会返回给客户端
    return NextResponse.json({
      success: true,
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (error) {
    console.error("🔁 [API Route] 刷新时发生异常:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
