// 统一 Server Action 返回结果类型

export type ActionResult<T> =
  | { success: true; data: T; message?: string }
  | { success: false; error: string; code?: string };

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
 * 处理 Server Action 中的错误
 * 统一将异常转换为 ActionResult
 */
export async function handleActionError<T>(
  action: () => Promise<T>,
  errorMessage = "操作失败"
): Promise<ActionResult<T>> {
  try {
    const data = await action();
    return createSuccessResult(data);
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    
    // 提取错误信息
    let errorMsg = errorMessage;
    if (error instanceof Error) {
      errorMsg = error.message;
    } else if (typeof error === "string") {
      errorMsg = error;
    } else if (
      error &&
      typeof error === "object" &&
      "detail" in error &&
      typeof error.detail === "string"
    ) {
      errorMsg = error.detail;
    }
    
    return createErrorResult(errorMsg);
  }
}

/**
 * 从 API 错误响应中提取错误信息
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === "string") {
    return error;
  }
  
  if (error && typeof error === "object") {
    // FastAPI 标准错误格式
    if ("detail" in error && typeof error.detail === "string") {
      return error.detail;
    }
    
    // 其他常见错误格式
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    
    if ("error" in error && typeof error.error === "string") {
      return error.error;
    }
  }
  
  return "未知错误";
}
