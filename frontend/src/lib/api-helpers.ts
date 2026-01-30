/**
 * 统一 API 响应提取工具
 * 处理后端的 ApiResponse<T> 格式
 */

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

/**
 * 提取 API 数据
 * 如果响应是 ApiResponse<T> 格式，提取 data 字段
 * 如果响应已经是数据本身（旧接口或直接返回），直接返回
 */
export function extractApiData<T>(response: { data?: T } | T | unknown): T {
  // 检查是否为 ApiResponse 结构
  if (
    response &&
    typeof response === "object" &&
    "code" in response &&
    "message" in response &&
    "data" in response
  ) {
    return (response as ApiResponse<T>).data;
  }

  // 兼容旧的手动包装格式 {"code": 200, "msg": "success", "data": ...}
  if (
    response &&
    typeof response === "object" &&
    "code" in response &&
    "msg" in response &&
    "data" in response
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (response as any).data;
  }

  // 兼容 data 字段包装 (可能是 openapi-fetch 的行为或者部分旧接口)
  if (
    response &&
    typeof response === "object" &&
    "data" in response &&
    Object.keys(response).length === 1 // 只有 data 字段
  ) {
    return (response as { data: T }).data;
  }

  // 默认假设响应本身就是数据
  return response as T;
}

/**
 * 处理分页响应
 * 兼容 ApiResponse<PaginatedResponse<T>> 和 PaginatedResponse<T> 和 T[]
 */
export function extractPaginatedData<T>(
  response:
    | { data?: { items: T[]; total: number } }
    | { items: T[]; total: number }
    | T[]
    | unknown,
): { items: T[]; total?: number; page?: number; page_size?: number } {
  // 1. 如果是数组，直接返回
  if (Array.isArray(response)) {
    return { items: response };
  }

  // 2. 尝试通过 extractApiData 获取内部数据
  const data = extractApiData<{ items: T[]; total: number } | T[]>(response);

  // 3. 再次检查获取到的数据
  if (Array.isArray(data)) {
    return { items: data };
  }

  if (
    data &&
    typeof data === "object" &&
    "items" in data &&
    Array.isArray(data.items)
  ) {
    return {
      items: data.items,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total: (data as any).total,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page: (data as any).page,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      page_size: (data as any).page_size,
    };
  }

  return { items: [] };
}

/**
 * 创建标准化的成功响应
 */
export function createSuccessResponse<T>(data: T) {
  return { success: true, data };
}

/**
 * 创建标准化的错误响应
 */
export function createErrorResponse(message: string, code?: string) {
  return { success: false, message, error: code };
}
