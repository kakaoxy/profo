import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getTokensFromCookies,
  setTokenCookies,
  clearTokenCookies,
  isTokenValid,
} from "@/lib/auth/core";
import { dedupServerRefresh } from "@/lib/auth/server/refresh-dedup";
import { isDefinitiveRejection } from "@/lib/auth/types";

/**
 * 客户端 token 刷新路由。
 *
 * cClient (openapi-fetch) 与 swr.ts 在收到 401 时会调用此路由刷新 token。
 * 内部走 library adapter.refreshToken，写回 c_access_token / c_refresh_token cookies。
 * 返回 { success: true }，token 仅通过 httpOnly cookie 传递，不暴露给客户端 JS。
 *
 * 同一 refresh_token 的并发刷新通过 `dedupServerRefresh` 去重（共享同一 Promise），
 * 避免 rotation 下「旧 jti 已撤销」误杀并发请求。仅后端明确拒绝（401/403）才清
 * cookies；瞬时失败（5xx/429/网络/超时）保留 cookies 并返回 503，允许客户端重试。
 */
export async function POST() {
  const config = auth.config;

  const tokens = await getTokensFromCookies(config);
  if (!tokens?.refreshToken) {
    // 缺少 refresh_token：清掉残留的 access_token cookie，避免半失效状态
    await clearTokenCookies(config);
    return NextResponse.json({ error: "No refresh token available" }, { status: 401 });
  }

  // refresh token 也过期：清 cookies，让客户端走登录流程
  if (!isTokenValid(tokens.refreshToken)) {
    await clearTokenCookies(config);
    return NextResponse.json({ error: "Refresh token expired" }, { status: 401 });
  }

  try {
    // 服务端去重：同一 refresh_token 的并发刷新共享同一 Promise，
    // 避免 rotation 下「旧 jti 已撤销」误杀并发请求（与 admin 端一致）。
    const refreshed = await dedupServerRefresh(tokens.refreshToken, () =>
      config.adapter.refreshToken(tokens.refreshToken),
    );
    await setTokenCookies(refreshed, config);

    // [安全修复] Token 仅通过 httpOnly cookie 传递，不返回到 JS 可读的响应体
    return NextResponse.json({ success: true });
  } catch (error) {
    if (isDefinitiveRejection(error)) {
      // 后端明确拒绝（refresh_token 已撤销/无效）：清 cookies 走登录流程
      await clearTokenCookies(config);
      const message = error instanceof Error ? error.message : "Token refresh failed";
      return NextResponse.json({ error: message }, { status: 401 });
    }
    // 瞬时失败（5xx/429/网络/超时）：保留 cookies，返回 503 让客户端按可重试错误处理
    return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
  }
}
