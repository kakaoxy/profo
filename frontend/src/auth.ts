import { Auth } from "@/lib/auth";
// 直接从 @/lib/auth/types 导入，避免经过 @/lib/auth 桶文件的循环依赖
import { ApiStatusError } from "@/lib/auth/types";
import { apiPaths, getApiUrl } from "@/lib/config";
import { extractApiError, fetchWithTimeout } from "@/lib/api/tokens";

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

// ─── 通用认证请求工具 ────────────────────────────────────────────────────────

// 实现已迁至 `lib/api/tokens.ts`（消除 admin-auth → auth 的反向依赖，spec D13）；
// 此处保留 re-export 以兼容既有引用方（components/auth/* 等）。
export { extractApiError, fetchWithTimeout } from "@/lib/api/tokens";

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
        throw new ApiStatusError(
          await extractApiError(response, "Token 刷新失败"),
          response.status,
        );
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
