/**
 * 错误处理工具函数
 * 统一处理 API 错误和网络错误
 */

/**
 * 解析 API 错误响应
 * 优先读取新格式 {"code":..., "message":"..."}，回退兼容旧格式 {"detail":"..."}
 * @param error - 错误对象
 * @returns 解析后的错误消息和类型
 */
export function parseApiError(error: unknown): { message: string; type: string } {
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;

    // 新统一错误格式 {"code":≠0, "message":"..."} (AGENTS.md §2)
    if (typeof err.message === "string") {
      return { message: err.message, type: "api" };
    }

    // 回退兼容旧格式 {"detail": "..."} (FastAPI 默认)
    if (typeof err.detail === "string") {
      return { message: err.detail, type: "api" };
    }

    // 验证错误 (Pydantic validation errors)
    if (Array.isArray(err.detail)) {
      const validationErrors = err.detail
        .map((e: { loc?: string[]; msg?: string }) => `${e.loc?.join(".")}: ${e.msg}`)
        .join("; ");
      return { message: `数据验证失败: ${validationErrors}`, type: "validation" };
    }
  }

  return { message: "操作失败，请稍后重试", type: "unknown" };
}

/**
 * 从 API 错误中提取错误消息（供 Server Action catch 块使用）
 * @param error - 错误对象
 * @param fallback - 提取失败时的兜底文案
 * @returns 错误消息字符串
 */
export function extractApiErrorMessage(error: unknown, fallback = "操作失败，请稍后重试"): string {
  return parseApiError(error).message || fallback;
}

/**
 * 解析网络错误
 * @param error - 错误对象
 * @returns 用户友好的错误消息
 */
export function parseNetworkError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return "网络连接失败，请检查网络后重试";
    }
    if (error.message.includes("timeout")) {
      return "请求超时，请稍后重试";
    }
    return error.message;
  }
  return "网络错误，请稍后重试";
}
