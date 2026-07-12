import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getTokensFromCookies,
  setTokenCookies,
  clearTokenCookies,
  isTokenValid,
} from "@/lib/auth/core";

/**
 * 客户端 token 刷新路由。
 *
 * cClient (openapi-fetch) 与 swr.ts 在收到 401 时会调用此路由刷新 token。
 * 内部走 library adapter.refreshToken，写回 c_access_token / c_refresh_token cookies。
 * 返回 { success: true }，token 仅通过 httpOnly cookie 传递，不暴露给客户端 JS。
 */
export async function POST() {
  const config = auth.config;

  const tokens = await getTokensFromCookies(config);
  if (!tokens?.refreshToken) {
    // 缺少 refresh_token：清掉残留的 access_token cookie，避免半失效状态
    await clearTokenCookies(config);
    return NextResponse.json(
      { error: "No refresh token available" },
      { status: 401 },
    );
  }

  // refresh token 也过期：清 cookies，让客户端走登录流程
  if (!isTokenValid(tokens.refreshToken)) {
    await clearTokenCookies(config);
    return NextResponse.json(
      { error: "Refresh token expired" },
      { status: 401 },
    );
  }

  try {
    const refreshed = await config.adapter.refreshToken(tokens.refreshToken);
    await setTokenCookies(refreshed, config);

    // [安全修复] Token 仅通过 httpOnly cookie 传递，不返回到 JS 可读的响应体
    return NextResponse.json({ success: true });
  } catch (error) {
    // 刷新失败（后端拒绝等）：清 cookies
    await clearTokenCookies(config);
    const message =
      error instanceof Error ? error.message : "Token refresh failed";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
