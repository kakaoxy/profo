/**
 * 错误处理工具函数
 * 统一处理 API 错误和网络错误
 */

/**
 * 解析 API 错误响应
 * @param error - 错误对象
 * @returns 解析后的错误消息和类型
 */
export function parseApiError(error: unknown): { message: string; type: string } {
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;

    // FastAPI 标准错误格式
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

    // 其他错误消息
    if (typeof err.message === "string") {
      return { message: err.message, type: "api" };
    }
  }

  return { message: "操作失败，请稍后重试", type: "unknown" };
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
