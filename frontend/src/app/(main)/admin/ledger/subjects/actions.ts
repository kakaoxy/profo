"use server";

import { revalidatePath } from "next/cache";
import { getAccessTokenFromCookie } from "@/lib/token-refresh-server";
import { getApiUrl } from "@/lib/config";
import { logger } from "@/lib/logger";
import {
  createSubjectSchema,
  subjectIdSchema,
  updateSubjectSchema,
  type Subject,
  type SubjectCreateInput,
  type SubjectMode,
  type SubjectUpdateInput,
} from "./_components/subject-schema";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

// ⚠️未覆盖：api-types.d.ts 尚未生成 /admin/subjects 路径（后端已就绪但未跑 pnpm gen-api）。
// 此处沿用 actions.ts::exportLedger 的 raw fetch + auth header 模式，类型在 subject-schema.ts 本地定义。
// 待后端启动执行 pnpm gen-api 后，可切换为 openapi-fetch 类型化调用。

async function authHeader(): Promise<string | null> {
  const token = await getAccessTokenFromCookie();
  return token ? `Bearer ${token}` : null;
}

function unauthorized<T>(): ActionResult<T> {
  return { success: false, message: "未登录或会话已过期，请重新登录" };
}

/** 从错误响应中提取 message，兼容 {message}/{detail} 两种结构 */
async function extractErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await res.json()) as {
      message?: string;
      detail?: string;
    };
    return body?.message || body?.detail || `${fallback} (HTTP ${res.status})`;
  } catch {
    return `${fallback} (HTTP ${res.status})`;
  }
}

/**
 * 获取科目列表
 *
 * @param mode 按业务模式筛选(agent/acquire)，不传则返回全部
 */
export async function listSubjects(
  mode?: SubjectMode,
): Promise<ActionResult<Subject[]>> {
  try {
    const auth = await authHeader();
    if (!auth) return unauthorized();

    const url = new URL(getApiUrl("/api/v1/admin/subjects"));
    if (mode) url.searchParams.set("mode", mode);

    const res = await fetch(url, {
      headers: { Authorization: auth },
      cache: "no-store",
    });

    if (!res.ok) {
      const msg = await extractErrorMessage(res, "获取科目列表失败");
      return { success: false, message: msg };
    }

    // 后端直接返回 list[FinanceSubjectResponse]，无 ApiResponse 包装
    const data = (await res.json()) as Subject[];
    return { success: true, data };
  } catch (e) {
    logger.error("获取科目列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 创建科目（system 由后端强制为 false）
 */
export async function createSubject(
  data: SubjectCreateInput,
): Promise<ActionResult<Subject>> {
  const parsed = createSubjectSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "科目参数不合法",
    };
  }
  try {
    const auth = await authHeader();
    if (!auth) return unauthorized();

    const res = await fetch(getApiUrl("/api/v1/admin/subjects"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const msg = await extractErrorMessage(res, "创建科目失败");
      return { success: false, message: msg };
    }

    const created = (await res.json()) as Subject;
    revalidatePath("/admin/ledger/subjects");
    return { success: true, data: created };
  } catch (e) {
    logger.error("创建科目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新科目（系统预置科目的 name/level 不可修改，由后端强制）
 *
 * @param id   科目ID
 * @param data 更新载荷（字段全可选）
 */
export async function updateSubject(
  id: string,
  data: SubjectUpdateInput,
): Promise<ActionResult<Subject>> {
  const idParsed = subjectIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "科目参数不合法",
    };
  }
  const bodyParsed = updateSubjectSchema.safeParse(data);
  if (!bodyParsed.success) {
    return {
      success: false,
      message: bodyParsed.error.issues[0]?.message ?? "科目参数不合法",
    };
  }
  try {
    const auth = await authHeader();
    if (!auth) return unauthorized();

    const res = await fetch(getApiUrl(`/api/v1/admin/subjects/${id}`), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const msg = await extractErrorMessage(res, "更新科目失败");
      return { success: false, message: msg };
    }

    const updated = (await res.json()) as Subject;
    revalidatePath("/admin/ledger/subjects");
    return { success: true, data: updated };
  } catch (e) {
    logger.error("更新科目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 删除科目（软删除，系统预置不可删除）
 */
export async function deleteSubject(id: string): Promise<ActionResult<null>> {
  const idParsed = subjectIdSchema.safeParse(id);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "科目参数不合法",
    };
  }
  try {
    const auth = await authHeader();
    if (!auth) return unauthorized();

    const res = await fetch(getApiUrl(`/api/v1/admin/subjects/${id}`), {
      method: "DELETE",
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      const msg = await extractErrorMessage(res, "删除科目失败");
      return { success: false, message: msg };
    }

    revalidatePath("/admin/ledger/subjects");
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除科目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
