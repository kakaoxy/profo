import createClient from "openapi-fetch";
import type { paths } from "../api-types";
import { getApiUrl } from "../config";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const MAX_RETRIES = 1;

async function getCAccessTokenFromCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get("c_access_token")?.value ?? null;
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
