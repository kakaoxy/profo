"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPaths, getApiUrl } from "@/lib/config";
import { createActionLogger } from "@/lib/logger";

const logger = createActionLogger("login");

// 定义登录接口返回的结构
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export type LoginState = {
  error?: string;
  mustChangePassword?: boolean; // 新增：是否强制修改密码
  username?: string;            // 新增：回传用户名以便修改密码使用
  tempToken?: string;           // 新增：如果有临时Token
} | null;

export async function loginAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "请输入账号和密码" };
  }

  const apiUrl = getApiUrl(apiPaths.auth.token);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username, password }),
    });

    // --- 错误处理：422 强制改密 / 通用错误 ---
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // 开发环境记录脱敏后的错误数据
      logger.devDebug("Login Failed", { status: response.status, error: errorData });

      // 后端返回: HTTP 422 + {"detail":"首次登录必须修改密码"} + Headers: X-Temp-Token, X-Must-Change-Password
      const isForceChange =
        response.status === 422 &&
        response.headers.get("X-Must-Change-Password") === "true";

      if (isForceChange) {
        const tempToken = response.headers.get("X-Temp-Token");

        if (!tempToken) {
          logger.error("无法提取 temp_token，请检查后端响应头");
          return { error: "系统错误：未获取到修改密码凭证" };
        }

        logger.devDebug("首次登录需修改密码，已获取临时 Token", { tokenPrefix: tempToken.substring(0, 10) });

        return {
          mustChangePassword: true,
          username: username,
          tempToken: tempToken
        };
      }

      // 返回通用错误信息（后端统一格式: {"detail": "错误信息"}）
      const errorMsg = typeof errorData.detail === "string"
        ? errorData.detail
        : "登录失败";

      return { error: errorMsg };
    }
    // --- 核心修复逻辑结束 ---

    const data: LoginResponse = await response.json();

    // 3. 写入 Cookies (access_token 和 refresh_token)
    const cookieStore = await cookies();

    // Access Token: 有效期与后端返回的 expires_in 一致 (通常 30 分钟)
    cookieStore.set("access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: data.expires_in, // 使用后端返回的实际过期秒数
      sameSite: "lax",
    });

    // Refresh Token: 有效期 7 天 (与后端 jwt_refresh_token_expire_days 一致)
    cookieStore.set("refresh_token", data.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: "lax",
    });

    logger.info("登录成功，access_token 和 refresh_token 已写入 Cookie");

  } catch (error) {
    logger.error("登录异常", error);
    return { error: "网络错误，请连接后端服务" };
  }

  redirect("/admin");
}

// --- 新增：修改初始密码 Action ---
export async function changePasswordAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username") as string;
  const currentPassword = formData.get("current_password") as string;
  const newPassword = formData.get("new_password") as string;
  const tempToken = formData.get("temp_token") as string;

  if (!newPassword || newPassword.length < 8) {
    return { error: "新密码长度至少需要 8 位", mustChangePassword: true, username };
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
        error: errorData.detail || "修改密码失败",
        mustChangePassword: true, // 保持在修改密码界面
        username
      };
    }

    // 修改成功后，通常需要用新密码重新登录一次
    // 或者如果后端直接返回了新 Token，我们可以在这里 set cookie
    // 这里简单起见，提示成功并让用户重新登录
    return { error: undefined }; // Success state

  } catch (error) {
    logger.error("修改密码请求失败", error);
    return { error: "请求失败，请稍后重试", mustChangePassword: true, username };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
  redirect("/admin/login");
}
