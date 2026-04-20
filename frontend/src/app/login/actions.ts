"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_BASE_URL } from "@/lib/config";

// 定义登录接口返回的结构
interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  // 有些后端会在 403 时返回 payload，这里预留类型
  detail?: string; 
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

  const apiUrl = `${API_BASE_URL}/api/v1/auth/token`; 

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "password", username, password }),
    });

    // --- 针对 403 的详细处理 ---
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      console.log("❌ [Debug] Login Failed Body:", JSON.stringify(errorData, null, 2));

      // 1. 解析错误对象的层级
      // 你的后端返回结构是: { error: { message: { temp_token: "..." } } }
      const errorObj = errorData.error || errorData.detail || {};
      
      // 有时候 message 是字符串，有时候是对象（如现在的情况）
      const messageObj = (typeof errorObj.message === 'object') ? errorObj.message : {};

      // 2. 判断是否是强制修改密码
      const isForceChange = response.status === 403 && (
        errorObj.code === "HTTP_403" ||
        messageObj.code === "HTTP_403" ||
        JSON.stringify(errorData).includes("首次登录")
      );

      if (isForceChange) {
        // 3. 深度挖掘 Token
        // 尝试从所有可能的层级获取 token，确保万无一失
        const tempToken = 
            messageObj.temp_token ||  // 最匹配你当前日志的路径
            errorObj.temp_token ||    // 备选路径
            errorData.temp_token;     // 根路径备选

        if (!tempToken) {
          console.error("💀 [Fatal] 无法提取 temp_token，请检查后端返回结构");
          return { error: "系统错误：未获取到修改密码凭证" };
        }

        console.log("✅ [Debug] 成功抓取到临时 Token:", tempToken.substring(0, 10) + "...");

        return { 
          mustChangePassword: true, 
          username: username,
          tempToken: tempToken 
        };
      }

      // 返回通用错误信息
      const errorMsg = typeof errorObj.message === 'string' 
        ? errorObj.message 
        : (messageObj.message || "登录失败");
        
      return { error: errorMsg };
    }
    // --- 核心修复逻辑结束 ---

    const data: LoginResponse = await response.json();

    // 3. 写入 Cookies (access_token 和 refresh_token)
    const cookieStore = await cookies();
    
    // Access Token: 有效期与后端返回的 expires_in 一致 (通常 600 分钟)
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

    console.log("✅ [登录成功] access_token 和 refresh_token 已写入 Cookie");

  } catch (error) {
    console.error("登录异常:", error);
    return { error: "网络错误，请连接后端服务" };
  }

  redirect("/");
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
  const apiUrl = `${API_BASE_URL}/api/v1/users/change-password`; 

  try {
    // 这里有个策略问题：如果没有 Token，我们如何调用这个接口？
    // 1. 如果有 tempToken，放在 Header 里
    // 2. 如果没有，我们可能需要先尝试用 login 接口获取 token (但 login 报 403...)
    // 3. 只能假设：
    //    A. 用户此时其实已经有了某种 Session
    //    B. 或者后端在 403 响应里给了 Token (上面 loginAction 尝试获取了)
    //    C. 这是一个开放接口但需要验证旧密码 (不太常见)
    
    // 我们先尝试带上 Cookie 里的 Token (如果有的话) 或者 tempToken
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
    console.error(error)
    return { error: "请求失败，请稍后重试", mustChangePassword: true, username };
  }
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("access_token");
  cookieStore.delete("refresh_token");
  redirect("/login");
}