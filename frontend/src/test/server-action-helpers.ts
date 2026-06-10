import { vi } from "vitest";

/**
 * 创建 Mock fetchClient 返回值
 * 模拟 openapi-fetch 的客户端接口
 */
export function createMockFetchClient(overrides?: {
  GET?: ReturnType<typeof vi.fn>;
  POST?: ReturnType<typeof vi.fn>;
  PUT?: ReturnType<typeof vi.fn>;
  DELETE?: ReturnType<typeof vi.fn>;
  PATCH?: ReturnType<typeof vi.fn>;
}) {
  return {
    GET: overrides?.GET ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    POST: overrides?.POST ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    PUT: overrides?.PUT ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    DELETE: overrides?.DELETE ?? vi.fn().mockResolvedValue({ data: null, error: null }),
    PATCH: overrides?.PATCH ?? vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

/**
 * 创建成功响应的 Mock 数据
 * 遵循后端 API 响应格式 { code: 0, message: "success", data: T }
 */
export function createSuccessResponse<T>(data: T) {
  return { code: 0, message: "success", data };
}

/**
 * 创建错误响应的 Mock 数据
 * 遵循后端 API 错误响应格式
 */
export function createErrorResponse(message: string, code = 1) {
  return { code, message, data: null };
}

/**
 * 创建 Mock cookies 对象（用于 vi.mock('next/headers')）
 */
export function createMockCookies(cookieMap?: Record<string, string>) {
  const store = new Map(Object.entries(cookieMap ?? {}));
  return {
    get: vi.fn((name: string) => {
      const value = store.get(name);
      return value ? { name, value } : undefined;
    }),
    set: vi.fn((name: string, value: string) => {
      store.set(name, value);
    }),
    delete: vi.fn((name: string) => {
      store.delete(name);
    }),
    getAll: vi.fn(() =>
      Array.from(store.entries()).map(([name, value]) => ({ name, value }))
    ),
  };
}
