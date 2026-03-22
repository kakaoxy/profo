/**
 * 统一 API 响应提取工具
 * 处理后端的 ApiResponse<T> 格式
 */

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface ApiResponseLegacy<T> {
  code: number;
  msg: string;
  data: T;
}

export interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

/**
 * 类型守卫：检查是否为 ApiResponse 结构
 */
function isApiResponse<T>(response: unknown): response is ApiResponse<T> {
  return (
    response !== null &&
    typeof response === "object" &&
    "code" in response &&
    "message" in response &&
    "data" in response
  );
}

/**
 * 类型守卫：检查是否为旧版 ApiResponse 结构
 */
function isApiResponseLegacy<T>(
  response: unknown
): response is ApiResponseLegacy<T> {
  return (
    response !== null &&
    typeof response === "object" &&
    "code" in response &&
    "msg" in response &&
    "data" in response
  );
}

/**
 * 类型守卫：检查是否为 data 包装结构
 */
function isDataWrapper<T>(
  response: unknown
): response is { data: T } {
  return (
    response !== null &&
    typeof response === "object" &&
    "data" in response &&
    Object.keys(response).length === 1
  );
}

/**
 * 提取 API 数据
 * 如果响应是 ApiResponse<T> 格式，提取 data 字段
 * 如果响应已经是数据本身（旧接口或直接返回），直接返回
 */
export function extractApiData<T>(response: { data?: T } | T | unknown): T {
  // 检查是否为 ApiResponse 结构
  if (isApiResponse<T>(response)) {
    return response.data;
  }

  // 兼容旧的手动包装格式 {"code": 200, "msg": "success", "data": ...}
  if (isApiResponseLegacy<T>(response)) {
    return response.data;
  }

  // 兼容 data 字段包装 (可能是 openapi-fetch 的行为或者部分旧接口)
  if (isDataWrapper<T>(response)) {
    return response.data;
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
    | unknown
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
    const paginatedData = data as PaginatedResponse<T>;
    return {
      items: paginatedData.items,
      total: paginatedData.total,
      page: paginatedData.page,
      page_size: paginatedData.page_size,
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
