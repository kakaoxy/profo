"use server";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import type { ActionResult } from "./actions";

type FinanceSubjectResponse = components["schemas"]["FinanceSubjectResponse"];

/**
 * 科目数据项（对应后端 FinanceSubjectResponse）
 * 保留别名以兼容旧调用方，类型直接取自 api-types。
 */
export type SubjectItem = FinanceSubjectResponse;

/**
 * 获取科目列表（Server Action）
 *
 * @param mode 业务模式筛选: "agent" | "acquire" | undefined(全部)
 */
export async function fetchSubjects(
  mode?: "agent" | "acquire",
): Promise<ActionResult<SubjectItem[]>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/subjects", {
      params: { query: { mode } },
    });

    if (error) {
      const msg = (error as { message?: string }).message || "获取科目列表失败";
      return { success: false, message: msg };
    }

    // 后端直接返回 list[FinanceSubjectResponse]，无 ApiResponse 包装
    return { success: true, data: data ?? [] };
  } catch (e) {
    logger.error("获取科目列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
