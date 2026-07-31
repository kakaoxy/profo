import { Auth } from "@/lib/auth";
import { apiPaths, getApiUrl } from "@/lib/config";

// ─── SessionUser 扩展 ────────────────────────────────────────────────────────
// 后端 /api/v1/auth/me 返回 UserResponse，包含 role (RoleResponse)。
// `role` 设为可选，避免影响 C 端 SessionUser（C 端 fetchUser 不返回 role）。
// `username/nickname/phone/avatar` 与 C 端 auth.ts 的 augmentation 同型，
// 模块 augmentation 合并后无冲突；当 admin-auth.ts 被单独加载时也能独立成立。
declare module "@/lib/auth" {
  interface SessionUser {
    username: string;
    nickname: string | null;
    phone: string | null;
    avatar: string | null;
    /** admin 专用：角色 code（如 "admin"/"operator"）。C 端会为 undefined。 */
    role?: string | null;
  }
}

// ─── 后端响应类型 ─────────────────────────────────────────────────────────────

interface AdminTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface AdminRoleResponse {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface AdminMeResponse {
  id: string;
  username: string;
  nickname: string | null;
  phone: string | null;
  avatar: string | null;
  role_id: string;
  role: AdminRoleResponse;
  status: string;
}

// ─── 强制改密错误 ─────────────────────────────────────────────────────────────

/**
 * 首次登录强制改密时由 admin adapter.login 抛出。
 *
 * Task 6 的 loginAction 通过 `instanceof AdminPasswordChangeRequiredError`
 * 捕获并提取 tempToken / username，返回
 * `{ mustChangePassword: true, tempToken, username }` 给前端。
 *
 * 选择「抛出 typed error」而非「返回判别联合」的原因：
 * `AuthAdapter.login` 的接口契约是 `Promise<TokenPair>`，返回联合会破坏类型；
 * 抛错保留了契约，同时通过 instanceof 让调用方可区分「强制改密」与「普通失败」。
 */
export class AdminPasswordChangeRequiredError extends Error {
  readonly tempToken: string;
  readonly username: string;

  constructor(tempToken: string, username: string) {
    super("首次登录必须修改密码");
    this.name = "AdminPasswordChangeRequiredError";
    this.tempToken = tempToken;
    this.username = username;
  }
}

// ─── 错误提取 ────────────────────────────────────────────────────────────────

async function extractApiError(
  response: Response,
  fallback: string,
): Promise<string> {
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

// ─── Admin Auth 配置 ─────────────────────────────────────────────────────────

/**
 * Admin Auth 实例。
 *
 * Cookie 名硬编码为 `access_token` / `refresh_token` 以匹配后端
 * `backend/dependencies/auth.py` 中的读取逻辑（与 C 端 `c_access_token` 区分）。
 *
 * Adapter 方法在服务端（Server Action / Middleware / Route Handler）执行，
 * 直接通过 `getApiUrl()` 调用后端，避免经过 Next.js rewrites 的额外跳转。
 *
 * 强制改密流程：后端在首次登录时返回 HTTP 422 + `X-Must-Change-Password: true`
 * 响应头 + `X-Temp-Token` 临时凭证。adapter.login 检测到此头后抛出
 * `AdminPasswordChangeRequiredError`（携带 tempToken / username），
 * 由 Task 6 的 admin loginAction 通过 instanceof 捕获并转换为前端可读结果。
 */
export const adminAuth = Auth({
  adapter: {
    async login(credentials) {
      const username = credentials.username;
      const password = credentials.password;
      if (typeof username !== "string" || typeof password !== "string") {
        throw new Error("请输入账号和密码");
      }

      const response = await fetch(getApiUrl(apiPaths.auth.token), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "password",
          username,
          password,
        }),
      });

      if (!response.ok) {
        // 后端返回 HTTP 422 + X-Must-Change-Password: true 表示首次登录需改密
        const mustChangePassword =
          response.status === 422 &&
          response.headers.get("X-Must-Change-Password") === "true";

        if (mustChangePassword) {
          const tempToken = response.headers.get("X-Temp-Token");
          if (!tempToken) {
            throw new Error("系统错误：未获取到修改密码凭证");
          }
          // 抛出 typed error 供 Task 6 的 loginAction 捕获
          throw new AdminPasswordChangeRequiredError(tempToken, username);
        }

        throw new Error(await extractApiError(response, "登录失败"));
      }

      const data: AdminTokenResponse = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    },

    async refreshToken(refreshToken) {
      const response = await fetch(getApiUrl(apiPaths.auth.refresh), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error(await extractApiError(response, "Token 刷新失败"));
      }

      const data: AdminTokenResponse = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      };
    },

    async fetchUser(accessToken) {
      const response = await fetch(getApiUrl(apiPaths.auth.me), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("获取用户信息失败");
      }

      const data: AdminMeResponse = await response.json();
      return {
        id: data.id,
        email: data.username, // SessionUser 必填字段，admin 用 username 占位
        username: data.username,
        nickname: data.nickname,
        phone: data.phone,
        avatar: data.avatar,
        role: data.role?.code ?? null,
      };
    },

    async logout(tokens) {
      try {
        await fetch(getApiUrl(apiPaths.auth.logout), {
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
    // admin 专用 cookie 名，与 C 端 c_access_token / c_refresh_token 区分
    accessTokenName: "access_token",
    refreshTokenName: "refresh_token",
    sameSite: "lax",
    path: "/",
  },
  pages: {
    signIn: "/admin/login",
    home: "/admin",
  },
  debug: process.env.NODE_ENV === "development",
  // 不覆盖 C 端 auth.ts 注册的全局单例。admin 代码通过 adminAuth.adapter.*
  // + setTokenCookies(tokens, adminAuth.config) 直接调用，不依赖单例。
  registerGlobal: false,
});
