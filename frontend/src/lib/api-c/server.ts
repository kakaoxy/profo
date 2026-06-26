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

async function cRefreshTokenServer(): Promise<CRefreshResult | null> {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("c_refresh_token")?.value;

    if (!refreshToken) {
      return null;
    }

    const { apiPaths, getApiUrl: getUrl } = await import("../config");

    const response = await fetch(getUrl(apiPaths.cAuth.refresh), {
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
      // 此时仍返回刷新后的 token 供当前请求使用，后续页面导航由 middleware 处理 cookie 刷新
    }

    return data;
  } catch {
    return null;
  }
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
