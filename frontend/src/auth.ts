import { Auth } from "@/lib/auth";
import { apiPaths, getApiUrl } from "@/lib/config";

// ─── SessionUser 扩展 ────────────────────────────────────────────────────────
// 后端 /public/auth/me 返回字段为 id/username/nickname/phone/avatar，
// 通过 module augmentation 让 SessionUser 包含这些字段，便于客户端直接读取。
declare module "@/lib/auth" {
  interface SessionUser {
    id: string;
    username: string;
    nickname: string | null;
    phone: string | null;
    avatar: string | null;
  }
}

// ─── 后端响应类型 ─────────────────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: {
    id?: string;
    username?: string;
    nickname?: string | null;
    phone?: string | null;
    avatar?: string | null;
  };
}

interface MeResponse {
  id: string;
  username: string;
  nickname: string | null;
  phone: string | null;
  avatar: string | null;
}

// ─── 带超时的 fetch ──────────────────────────────────────────────────────────

/**
 * 给 fetch 加超时保护，防止后端挂起时前端永久卡死。
 *
 * 后端 /token 或 /me 挂起时（如 admin /me 的权限慢查询），无超时会导致
 * loginAction 永不返回，登录页 isPending 永久 true。超时后抛
 * Error("登录服务响应超时")，由 loginAction catch 转为可读错误。
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  // 仅当超时触发时为 true，用于在 catch 中区分超时与调用者主动 abort
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // 复用调用者传入的 signal：外部 abort 时同步触发内部 controller，
  // 避免直接覆盖 init.signal 导致调用者的 abort 逻辑失效。
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // 超时给出可读提示；调用者主动 abort 时透传原错误，不误报为超时
      if (timedOut) {
        throw new Error("登录服务响应超时，请稍后重试");
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * 给 fetch 加超时保护，防止后端挂起时前端永久卡死。
 *
 * 后端 /token 或 /me 挂起时（如 admin /me 的权限慢查询），无超时会导致
 * loginAction 永不返回，登录页 isPending 永久 true。超时后抛
 * Error("登录服务响应超时")，由 loginAction catch 转为可读错误。
 *
 * 导出供 admin-auth.ts 复用，避免重复实现。
 */
export { fetchWithTimeout };

// ─── 错误提取 ────────────────────────────────────────────────────────────────

/**
 * 从后端错误响应提取可读消息。
 *
 * 导出供 admin-auth.ts 复用，避免重复实现。
 */
export async function extractApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return fallback;
    const obj = data as Record<string, unknown>;
    // 优先读新格式 {"code":≠0, "message":"..."} (AGENTS.md §2)
    if (typeof obj.message === "string") return obj.message;
    // 回退旧格式 {"detail": "..."} (FastAPI 默认)
    if (typeof obj.detail === "string") return obj.detail;
    const err = obj.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === "string") return err.message;
    return fallback;
  } catch {
    return fallback;
  }
}

// ─── C 端 Auth 配置 ───────────────────────────────────────────────────────────

/**
 * C 端 Auth 实例。
 *
 * Cookie 名硬编码为 `c_access_token` / `c_refresh_token` 以匹配后端
 * `backend/dependencies/auth.py` 中的读取逻辑。
 *
 * Adapter 方法在服务端（Server Action / Middleware / Route Handler）执行，
 * 直接通过 `getApiUrl()` 调用后端，避免经过 Next.js rewrites 的额外跳转。
 */
export const auth = Auth({
  adapter: {
    async login(credentials) {
      const username = credentials.username;
      const password = credentials.password;
      if (typeof username !== "string" || typeof password !== "string") {
        throw new Error("请输入账号和密码");
      }

      const response = await fetchWithTimeout(getApiUrl(apiPaths.cAuth.login), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          username,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(await extractApiError(response, "登录失败"));
      }

      const data: TokenResponse = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    },

    async refreshToken(refreshToken) {
      const response = await fetchWithTimeout(getApiUrl(apiPaths.cAuth.refresh), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error(await extractApiError(response, "Token 刷新失败"));
      }

      const data: TokenResponse = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    },

    async fetchUser(accessToken) {
      const response = await fetchWithTimeout(getApiUrl(apiPaths.cAuth.me), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("获取用户信息失败");
      }

      const data: MeResponse = await response.json();
      return {
        id: data.id,
        email: data.username, // SessionUser 必填字段，C 端用 username 占位
        username: data.username,
        nickname: data.nickname,
        phone: data.phone,
        avatar: data.avatar,
      };
    },

    async logout(tokens) {
      try {
        await fetch(getApiUrl(apiPaths.cAuth.logout), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokens.accessToken}`,
          },
          body: JSON.stringify({ refresh_token: tokens.refreshToken }),
        });
      } catch {
        // 后端登出失败不阻塞，cookie 仍会被清除
      }
    },
  },
  cookies: {
    // 后端硬编码 cookie 名，必须精确匹配
    accessTokenName: "c_access_token",
    refreshTokenName: "c_refresh_token",
    sameSite: "lax",
    path: "/",
  },
  pages: {
    signIn: "/login",
    home: "/",
  },
  debug: process.env.NODE_ENV === "development",
});
