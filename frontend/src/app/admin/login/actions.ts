"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { adminAuth, AdminPasswordChangeRequiredError } from "@/admin-auth";
import {
  clearTokenCookies,
  getTokensFromCookies,
  setTokenCookies,
} from "@/lib/auth/core";
import { TokenPairSchema } from "@/lib/auth/types";
import { apiPaths, getApiUrl } from "@/lib/config";
import { createActionLogger } from "@/lib/logger";
import { passwordSchema } from "@/app/(main)/admin/users/_components/password-schema";

const logger = createActionLogger("login");

const loginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

// 原密码仅做非空校验，新密码复用全站密码复杂度策略
const changePasswordSchema = z.object({
  current_password: z.string().min(1, "请输入原密码"),
  new_password: passwordSchema,
});

export type LoginState = {
  error?: string;
  mustChangePassword?: boolean; // 新增：是否强制修改密码
  username?: string;            // 新增：回传用户名以便修改密码使用
  tempToken?: string;           // 新增：如果有临时Token
} | null;

// changePasswordAction 专用返回类型：成功/失败为判别联合，强制调用方用 success 字段判断
export type ChangePasswordState =
  | { success: true }
  | { success: false; error: string; mustChangePassword: true; username: string };

/**
 * Admin 登录 Server Action。
 *
 * 通过 `adminAuth.adapter.login` 调用后端 `/api/v1/auth/token`，再用
 * `setTokenCookies(tokens, adminAuth.config)` 写入 admin 专用 cookie
 * (`access_token` / `refresh_token`)。直接走 adapter + cookie 工具而不使用
 * `adminAuth.actions.login`，因为后者依赖模块级 singleton，当 C 端 `auth.ts`
 * 与 `admin-auth.ts` 同时加载时会读到错误的 config（Task 5 singleton 冲突）。
 *
 * 强制改密流程：后端首次登录返回 HTTP 422 + `X-Must-Change-Password: true`
 * + `X-Temp-Token`，admin adapter 检测到此头后抛出 `AdminPasswordChangeRequiredError`，
 * 这里通过 `instanceof` 捕获并返回 `{ mustChangePassword: true, tempToken, username }`。
 */
export async function loginAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  const loginParsed = loginSchema.safeParse({ username, password });
  if (!loginParsed.success) {
    return { error: loginParsed.error.issues[0]?.message ?? "登录参数不合法" };
  }

  try {
    const rawTokens = await adminAuth.adapter.login({ username, password });

    // 校验 adapter 返回的 token pair（防止后端响应格式异常时写入空 cookie）
    const tokenParsed = TokenPairSchema.safeParse(rawTokens);
    if (!tokenParsed.success) {
      logger.error("登录响应格式异常", { issues: tokenParsed.error.issues });
      return { error: "登录响应格式异常" };
    }

    await setTokenCookies(tokenParsed.data, adminAuth.config);
    logger.info("登录成功，access_token 和 refresh_token 已写入 Cookie");
  } catch (error) {
    // 强制改密：admin adapter 抛出 typed error，提取 tempToken / username 回传前端
    if (error instanceof AdminPasswordChangeRequiredError) {
      logger.devDebug("首次登录需修改密码，已获取临时 Token", {
        tokenPrefix: error.tempToken.substring(0, 10),
      });
      return {
        mustChangePassword: true,
        username: error.username,
        tempToken: error.tempToken,
      };
    }

    logger.error("登录异常", error);
    // adapter 抛出的 Error 已包含后端返回的可读 message（extractApiError 提取）
    return { error: error instanceof Error ? error.message : "登录失败" };
  }

  redirect("/admin");
}

// --- 新增：修改初始密码 Action ---
export async function changePasswordAction(prevState: ChangePasswordState | null, formData: FormData): Promise<ChangePasswordState> {
  const username = (formData.get("username") as string) ?? "";
  const currentPassword = formData.get("current_password") as string;
  const newPassword = formData.get("new_password") as string;
  const tempToken = formData.get("temp_token") as string;

  const changeParsed = changePasswordSchema.safeParse({
    current_password: currentPassword,
    new_password: newPassword,
  });
  if (!changeParsed.success) {
    return {
      success: false,
      error: changeParsed.error.issues[0]?.message ?? "密码参数不合法",
      mustChangePassword: true,
      username,
    };
  }

  // 注意：这里调用的是修改密码接口
  const apiUrl = getApiUrl(apiPaths.users.changePassword);

  try {
    // 使用 loginAction 从响应头获取的 tempToken 作为 Bearer 认证
    let token = tempToken;
    if (!token) {
        const cookieStore = await cookies();
        token = cookieStore.get("access_token")?.value || "";
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errorData.message || "修改密码失败",
        mustChangePassword: true, // 保持在修改密码界面
        username
      };
    }

    // 修改密码成功：立即失效 Token（清 cookie），满足 project_memory 硬约束
    // Token 必须在密码变更时立即失效
    const cookieStore = await cookies();
    cookieStore.delete({ name: "access_token", path: "/" });
    cookieStore.delete({ name: "refresh_token", path: "/" });
  } catch (error) {
    logger.error("修改密码请求失败", error);
    return { success: false, error: "请求失败，请稍后重试", mustChangePassword: true, username };
  }

  // redirect 必须放在 try/catch 之外：next/navigation 的 redirect() 会抛出
  // NEXT_REDIRECT 内部错误以中止执行，若被 try/catch 吞掉会导致流程异常
  redirect("/admin/login");
}

/**
 * Admin 登出 Server Action。
 *
 * 通过 `adminAuth.adapter.logout` 调用后端 `/api/v1/auth/logout` 撤销 refresh_token，
 * 再用 `clearTokenCookies(adminAuth.config)` 清除 admin cookie。直接走 adapter +
 * cookie 工具而不使用 `adminAuth.actions.logout`，原因同 `loginAction`。
 */
export async function logoutAction() {
  const tokens = await getTokensFromCookies(adminAuth.config);

  if (tokens && adminAuth.adapter.logout) {
    try {
      await adminAuth.adapter.logout(tokens);
    } catch (error) {
      // 后端调用失败不阻断登出流程，仍清前端 cookie 保证 UX
      logger.error("后端 logout 调用失败", error);
    }
  }

  await clearTokenCookies(adminAuth.config);
  redirect("/admin/login");
}
