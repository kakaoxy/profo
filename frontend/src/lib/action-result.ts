// 统一 Server Action 返回结果类型

export type ActionResult<T> =
  { success: true; data: T; message?: string } | { success: false; error: string; code?: string };

/**
 * 创建成功的 Action 结果
 */
export function createSuccessResult<T>(data: T, message?: string): ActionResult<T> {
  return { success: true, data, message };
}

/**
 * 创建失败的 Action 结果
 */
export function createErrorResult(error: string, code?: string): ActionResult<never> {
  return { success: false, error, code };
}

/**
 * 从 API 错误响应中提取错误信息
 * 优先读取新格式 {"code":..., "message":"..."}，回退兼容旧格式 {"detail":"..."}
 */
export function extractErrorMessage(error: unknown, fallbackMessage = "未知错误"): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    // 新统一错误格式 {"code":≠0, "message":"..."} (AGENTS.md §2)
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }

    // 回退兼容旧格式 {"detail": "..."} (FastAPI 默认)
    if ("detail" in error && typeof error.detail === "string") {
      return error.detail;
    }

    if ("error" in error && typeof error.error === "string") {
      return error.error;
    }
  }

  return fallbackMessage;
}
