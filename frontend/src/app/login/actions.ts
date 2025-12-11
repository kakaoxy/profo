"use server";

import { fetchClient } from "@/lib/api-client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// 1. 定义一个类型，告诉 TS 这个状态里可能有什么
// 这里我们规定：状态要么是 null（初始），要么包含一个 error 字符串
export type LoginState = {
  error?: string;
} | null;

// 2. 将 prevState: any 修改为 prevState: LoginState
export async function loginAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  const client = await fetchClient();

  const { data, error } = await client.POST("/api/auth/login", {
    body: {
      username,
      password,
    },
  });

  if (error) {
    // 登录失败，返回错误信息
    // 注意：这里我们假设 error 对象里有 detail 字段，如果没有，可以根据实际情况调整
    // 这里的 string(error) 是为了兜底，防止 error 是复杂对象导致报错
    return { error: "登录失败：用户名或密码错误" };
  }

  // 登录成功
  const cookieStore = await cookies();
  cookieStore.set("access_token", data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: data.expires_in,
    path: "/",
  });

  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("access_token"); // 删除 Token
  redirect("/login"); // 踢回登录页
}