import createClient from "openapi-fetch";
import type { paths } from "../api-types";
import { apiPaths, getApiUrl } from "../config";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { CUser } from "./user-context";

const MAX_RETRIES = 1;

async function getCAccessTokenFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("c_access_token")?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * 在 Server Component 中获取当前 C 端登录用户。
 * - 无 token / token 失效 / refresh 失败：返回 null（不重定向，由客户端组件按需处理）
 * - 成功：返回用户信息
 *
 * 用于 (c)/layout.tsx 服务端鉴权，把结果通过 CUserProvider 注入给客户端组件。
 */
export async function getCurrentCUser(): Promise<CUser | null> {
  const token = await getCAccessTokenFromCookie();
  if (!token) return null;

  try {
    const res = await fetch(getApiUrl(apiPaths.cAuth.me), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as CUser;
  } catch {
    return null;
  }
}

interface CRefreshResult {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function cRefreshTokenServer(): Promise<CRefreshResult | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("c_refresh_token")?.value;

    if (!refreshToken) {
      return null;
    }

    const response = await fetch(getApiUrl(apiPaths.cAuth.refresh), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      return null;
    }

    const data: CRefreshResult = await response.json();

    try {
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
    } catch {
      // Server Component 上下文中无法修改 cookie（仅 Server Action / Route Handler 可写）
      // 此时仍返回刷新后的 token 供当前请求使用，后续页面导航由 proxy.ts 处理 cookie 刷新
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * 获取有效 access_token，cookie 中无 token 时自动用 refresh_token 刷新。
 * 供 C 端 Server Action 统一获取认证凭据，避免 access_token cookie 过期
 * （30 分钟）后直接报"请登录"而 refresh_token（7 天）仍可用的问题。
 */
export async function getValidCAccessToken(): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("c_access_token")?.value;
  if (accessToken) return accessToken;

  const result = await cRefreshTokenServer();
  return result?.access_token ?? null;
}

/**
 * 带 401 自动刷新重试的 fetch，供 C 端 Server Action 统一调用后端受保护接口。
 * - 优先用 cookie 中的 access_token；无则先刷新
 * - 收到 401 时自动刷新 token 并重试一次
 * - 刷新失败则返回 401 响应，由调用方判断是否提示"请登录"
 */
export async function cServerActionFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getValidCAccessToken();

  const existingHeaders: Record<string, string> = {};
  if (init.headers instanceof Headers) {
    init.headers.forEach((value, key) => {
      existingHeaders[key] = value;
    });
  } else if (Array.isArray(init.headers)) {
    init.headers.forEach(([key, value]) => {
      existingHeaders[key] = value;
    });
  } else if (typeof init.headers === "object" && init.headers !== null) {
    Object.assign(existingHeaders, init.headers);
  }

  const makeRequest = (bearerToken: string | null) =>
    fetch(getApiUrl(path), {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...existingHeaders,
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      },
    });

  let response = await makeRequest(token);

  if (response.status === 401) {
    const refreshed = await cRefreshTokenServer();
    if (refreshed?.access_token) {
      response = await makeRequest(refreshed.access_token);
    }
  }

  return response;
}

export async function cFetchClient() {
  const fetchWithAutoRefresh: typeof fetch = async (input, init) => {
    const makeRequest = async (bearerToken: string | null) => {
      const requestHeaders =
        input instanceof Request
          ? Object.fromEntries(input.headers.entries())
          : {};

      return fetch(input, {
        ...init,
        headers: {
          ...requestHeaders,
          ...init?.headers,
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
      });
    };

    let token = await getCAccessTokenFromCookie();
    let retries = 0;

    while (retries <= MAX_RETRIES) {
      const response = await makeRequest(token);

      if (response.status !== 401) {
        return response;
      }

      if (retries >= MAX_RETRIES) {
        return response;
      }

      retries++;

      const result = await cRefreshTokenServer();

      if (!result?.access_token) {
        redirect("/login");
      }

      token = result.access_token;
    }

    return makeRequest(token);
  };

  return createClient<paths>({
    baseUrl: getApiUrl(""),
    fetch: fetchWithAutoRefresh,
  });
}
