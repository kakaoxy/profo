import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminAuth } from "@/admin-auth";
import { clearTokenCookies, setTokenCookies } from "@/lib/auth/core";
import { sanitizeCallbackUrl } from "@/lib/auth/utils/sanitize-callback-url";
import { debugLog } from "@/lib/auth/config";

/**
 * POST /api/auth/refresh[?next=<root-relative-path>]
 *
 * 客户端调用此路由来刷新 Token。
 * 由于 refresh_token 存储在 httpOnly cookie 中，客户端无法直接读取，
 * 所以需要通过这个 API 路由来代理刷新请求。
 *
 * 通过 `adminAuth.adapter.refreshToken` 调用后端 `/api/v1/auth/refresh`，
 * 再用 `setTokenCookies(tokens, adminAuth.config)` 写入 cookie（maxAge 从
 * token exp claim 读取，不再硬编码 `expires_in || 36000` / `60*60*24*7`）。
 * 刷新失败时 `clearTokenCookies` 清除 cookie 并返回 401，强制用户重新登录
 * （fail-closed：不再区分 401/403/500，任何刷新失败都视为会话失效）。
 *
 * Task 8.2: 支持 `?next=<path>` 查询参数，用于 Server Component 401 重定向流程：
 *  - **导航请求**（`Accept: text/html`）：刷新成功后 303 重定向到 `next`，
 *    浏览器重新加载原页面并带上新 cookie。
 *  - **API 请求**（`Accept: application/json` 或 `X-Requested-With: XMLHttpRequest`）：
 *    返回 `{ success: true, redirect: next }` JSON，由客户端 JS 自行跳转/重试。
 *  - **无 `next` 参数**：保持旧行为，返回 `{ success: true }`。
 *
 * `next` 必须是 root-relative 路径（`/` 开头且非 `//`），由
 * `sanitizeCallbackUrl` 校验，防止 open redirect 攻击。
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(adminAuth.config.cookieNames.refreshToken)?.value;

  if (!refreshToken) {
    debugLog("[admin refresh route] 无 refresh_token 可用");
    return NextResponse.json({ error: "No refresh token available" }, { status: 401 });
  }

  // Task 8.2: 解析并校验 `next` 参数（仅允许 root-relative 路径）
  const url = new URL(request.url);
  const rawNext = url.searchParams.get("next") ?? undefined;
  const nextPath = sanitizeCallbackUrl(rawNext);

  try {
    debugLog("[admin refresh route] 向后端请求刷新 token...", { next: nextPath });
    const tokens = await adminAuth.adapter.refreshToken(refreshToken);
    await setTokenCookies(tokens, adminAuth.config);
    debugLog("[admin refresh route] Token 刷新成功");

    // Task 8.2: 有 `next` 参数时按请求类型决定返回方式
    if (nextPath) {
      const accept = request.headers.get("accept") ?? "";
      const isHtmlRequest = accept.includes("text/html");
      const isAjaxRequest =
        accept.includes("application/json") ||
        request.headers.get("x-requested-with") === "XMLHttpRequest";

      if (isHtmlRequest) {
        // 导航请求：303 重定向回原路径（POST → GET 语义），浏览器带上新 cookie 重新加载
        debugLog("[admin refresh route] HTML 请求 — 303 重定向到", nextPath);
        return NextResponse.redirect(new URL(nextPath, request.url), {
          status: 303,
        });
      }

      if (isAjaxRequest) {
        // API 请求：返回 JSON，由客户端 JS 决定是否跳转/重试
        debugLog("[admin refresh route] AJAX 请求 — 返回 JSON 含 redirect");
        return NextResponse.json({ success: true, redirect: nextPath });
      }

      // 未明确请求类型但有 next：保守返回 JSON（含 redirect 字段），
      // 避免对未知 Accept 误触发浏览器导航
      debugLog("[admin refresh route] 未识别 Accept 但有 next — 返回 JSON");
      return NextResponse.json({ success: true, redirect: nextPath });
    }

    // 无 next 参数：保持旧行为
    // [安全修复] Token 仅通过 httpOnly cookie 传递，不返回到 JS 可读的响应体
    return NextResponse.json({ success: true });
  } catch (error) {
    debugLog("[admin refresh route] 刷新失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    // 刷新失败：清除 cookies，强制用户重新登录（fail-closed）
    await clearTokenCookies(adminAuth.config);
    return NextResponse.json({ error: "Token refresh failed" }, { status: 401 });
  }
}

/**
 * GET /api/auth/refresh?next=<root-relative-path>
 *
 * Server Component 渲染期收到 401 时，api-server.ts 调用
 * `redirect("/api/auth/refresh?next=...")`，Next.js 把 NEXT_REDIRECT 转成
 * 浏览器 303 跳转，浏览器以 GET 方法请求本路由。
 *
 * 行为：
 *  - 无 refresh_token / 刷新失败：清 cookie 并 303 重定向到 /admin/login
 *    （不能返回 JSON，因为浏览器导航无法处理 JSON 响应）
 *  - 刷新成功：setTokenCookies 落盘新 token，303 重定向回 `next` 路径
 *  - `next` 缺失或不合法：回退到 /admin
 *
 * 安全：
 *  - 仅使用 httpOnly cookie 中的 refresh_token，JS 不可读
 *  - `next` 经 sanitizeCallbackUrl 校验，仅允许 root-relative 路径，防 open redirect
 *  - GET + cookie 认证符合项目 CSRF 规约（仅非 GET 方法需 X-Requested-With）
 *
 * 注意：`request.url` 在 Next.js standalone 模式下使用容器主机名（如
 * `6697190d49c7:3000`），不能直接用于构造重定向 URL。改为从 `Host` +
 * `X-Forwarded-Proto` 请求头构造公开 URL（nginx 反代已正确设置这两个头）。
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(adminAuth.config.cookieNames.refreshToken)?.value;

  const url = new URL(request.url);
  const rawNext = url.searchParams.get("next") ?? "/admin";
  const nextPath = sanitizeCallbackUrl(rawNext) ?? "/admin";

  // 构造公开 URL：优先从 Host + X-Forwarded-Proto 头构造（nginx 反代已设置），
  // 避免 request.url 使用容器主机名导致浏览器无法访问重定向目标
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host");
  const baseUrl = host ? `${proto}://${host}` : request.url;

  // 无 refresh_token：清 cookie 并跳登录
  if (!refreshToken) {
    debugLog("[admin refresh route] GET: 无 refresh_token 可用，跳登录");
    await clearTokenCookies(adminAuth.config);
    const loginUrl = new URL("/admin/login", baseUrl);
    if (nextPath && nextPath !== "/admin") {
      loginUrl.searchParams.set("redirect", nextPath);
    }
    return NextResponse.redirect(loginUrl, {
      status: 303,
    });
  }

  try {
    debugLog("[admin refresh route] GET: 向后端请求刷新 token...", { next: nextPath });
    const tokens = await adminAuth.adapter.refreshToken(refreshToken);
    await setTokenCookies(tokens, adminAuth.config);
    debugLog("[admin refresh route] GET: Token 刷新成功，303 重定向到", nextPath);
    return NextResponse.redirect(new URL(nextPath, baseUrl), {
      status: 303,
    });
  } catch (error) {
    debugLog("[admin refresh route] GET: 刷新失败", {
      error: error instanceof Error ? error.message : String(error),
    });
    // fail-closed：清 cookie 并跳登录
    await clearTokenCookies(adminAuth.config);
    const loginUrl = new URL("/admin/login", baseUrl);
    if (nextPath && nextPath !== "/admin") {
      loginUrl.searchParams.set("redirect", nextPath);
    }
    return NextResponse.redirect(loginUrl, {
      status: 303,
    });
  }
}
