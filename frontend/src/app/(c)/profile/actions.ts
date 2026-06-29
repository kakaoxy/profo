"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { apiPaths } from "@/lib/config";
import { ActionResult, createSuccessResult, createErrorResult } from "@/lib/action-result";
import { cServerActionFetch } from "@/lib/api-c/server";
import { cLocale } from "@/lib/i18n/c-locale";

const updateProfileSchema = z.object({
  nickname: z.string().min(1, cLocale.profileAction.nicknameRequired).max(100, cLocale.profileAction.nicknameMaxLength),
});

const updatePhoneSchema = z.object({
  phone: z.string().min(1, cLocale.profileAction.phoneRequired).regex(/^1[3-9]\d{9}$/, cLocale.profileAction.phoneInvalid),
  password: z.string().min(6, cLocale.profileAction.passwordMinLength),
});

export async function updateProfileAction(_: ActionResult<{ nickname: string }>, formData: FormData): Promise<ActionResult<{ nickname: string }>> {
  const raw = { nickname: formData.get("nickname") ?? "" };
  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) return createErrorResult(parsed.error.issues[0].message);

  try {
    const response = await cServerActionFetch(apiPaths.cUsers.profile, {
      method: "PUT",
      body: JSON.stringify({ nickname: parsed.data.nickname }),
    });
    if (response.status === 401) {
      return createErrorResult(cLocale.common.error.loginRequired);
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || cLocale.profileAction.updateFailed);
    }
    // 重新渲染整个 (c) layout 树，触发服务端重新调用 /public/auth/me 刷新 Context
    revalidatePath("/", "layout");
    return createSuccessResult({ nickname: parsed.data.nickname }, cLocale.profileAction.updateSuccess);
  } catch {
    return createErrorResult(cLocale.common.error.network);
  }
}

export async function updatePhoneAction(_: ActionResult<{ phone: string }>, formData: FormData): Promise<ActionResult<{ phone: string }>> {
  const raw = { phone: formData.get("phone") ?? "", password: formData.get("password") ?? "" };
  const parsed = updatePhoneSchema.safeParse(raw);
  if (!parsed.success) return createErrorResult(parsed.error.issues[0].message);

  try {
    const response = await cServerActionFetch(apiPaths.cUsers.phone, {
      method: "PUT",
      body: JSON.stringify({ phone: parsed.data.phone, password: parsed.data.password }),
    });
    if (response.status === 401) {
      return createErrorResult(cLocale.common.error.loginRequired);
    }
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return createErrorResult(errorData.detail || cLocale.profileAction.updateFailed);
    }
    const data = await response.json();
    // 重新渲染整个 (c) layout 树，触发服务端重新调用 /public/auth/me 刷新 Context
    revalidatePath("/", "layout");
    return createSuccessResult({ phone: data.phone }, cLocale.profileAction.phoneUpdateSuccess);
  } catch {
    return createErrorResult(cLocale.common.error.network);
  }
}
