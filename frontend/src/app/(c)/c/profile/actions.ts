"use server";

import { cookies } from "next/headers";
import { apiPaths, getApiUrl } from "@/lib/config";
import { ActionResult, createSuccessResult, createErrorResult } from "@/lib/action-result";

export async function updateProfileAction(_: ActionResult<{ nickname: string }>, formData: FormData): Promise<ActionResult<{ nickname: string }>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("c_access_token")?.value;
  if (!token) return createErrorResult("请先登录");
  const nickname = formData.get("nickname") as string;
  if (!nickname || nickname.length > 100) return createErrorResult("昵称格式不正确");
  try {
    const response = await fetch(getApiUrl(apiPaths.cUsers.profile), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ nickname }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || "修改失败");
    }
    return createSuccessResult({ nickname }, "修改成功");
  } catch {
    return createErrorResult("网络错误");
  }
}

export async function updatePhoneAction(_: ActionResult<{ phone: string }>, formData: FormData): Promise<ActionResult<{ phone: string }>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("c_access_token")?.value;
  if (!token) return createErrorResult("请先登录");
  const phone = formData.get("phone") as string;
  const password = formData.get("password") as string;
  if (!phone || !password) return createErrorResult("请填写完整信息");
  try {
    const response = await fetch(getApiUrl(apiPaths.cUsers.phone), {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ phone, password }),
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
