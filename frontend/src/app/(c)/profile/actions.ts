"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { apiPaths, getApiUrl } from "@/lib/config";
import { ActionResult, createSuccessResult, createErrorResult } from "@/lib/action-result";

const updateProfileSchema = z.object({
  nickname: z.string().min(1, "昵称不能为空").max(100, "昵称不能超过100个字符"),
});

const updatePhoneSchema = z.object({
  phone: z.string().min(1, "手机号不能为空").regex(/^1[3-9]\d{9}$/, "手机号格式不正确"),
  password: z.string().min(6, "密码不能少于6个字符"),
});

export async function updateProfileAction(_: ActionResult<{ nickname: string }>, formData: FormData): Promise<ActionResult<{ nickname: string }>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("c_access_token")?.value;
  if (!token) return createErrorResult("请先登录");

  const raw = { nickname: formData.get("nickname") ?? "" };
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) return createErrorResult(parsed.error.issues[0].message);

  try {
    const response = await fetch(getApiUrl(apiPaths.cUsers.profile), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ nickname: parsed.data.nickname }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || "修改失败");
    }
    return createSuccessResult({ nickname: parsed.data.nickname }, "修改成功");
  } catch {
    return createErrorResult("网络错误");
  }
}

export async function updatePhoneAction(_: ActionResult<{ phone: string }>, formData: FormData): Promise<ActionResult<{ phone: string }>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("c_access_token")?.value;
  if (!token) return createErrorResult("请先登录");

  const raw = { phone: formData.get("phone") ?? "", password: formData.get("password") ?? "" };
  const parsed = updatePhoneSchema.safeParse(raw);
  if (!parsed.success) return createErrorResult(parsed.error.issues[0].message);

  try {
    const response = await fetch(getApiUrl(apiPaths.cUsers.phone), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ phone: parsed.data.phone, password: parsed.data.password }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || "修改失败");
    }
    const data = await response.json();
    return createSuccessResult({ phone: data.phone }, "手机号修改成功");
  } catch {
    return createErrorResult("网络错误");
  }
}
