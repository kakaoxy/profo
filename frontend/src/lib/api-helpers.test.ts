import { describe, expect, test } from "vitest";
import {
  extractApiData,
  extractPaginatedData,
  createSuccessResponse,
  createErrorResponse,
  type ApiResponse,
  type ApiResponseLegacy,
  type PaginatedResponse,
} from "./api-helpers";

describe("api-helpers", () => {
  describe("extractApiData", () => {
    test("应该提取标准 ApiResponse 中的 data", () => {
      const response: ApiResponse<string> = {
        code: 200,
        message: "success",
        data: "test data",
      };
      expect(extractApiData(response)).toBe("test data");
    });

    test("应该提取旧版 ApiResponse 中的 data", () => {
      const response: ApiResponseLegacy<string> = {
        code: 200,
        msg: "success",
        data: "legacy data",
      };
      expect(extractApiData(response)).toBe("legacy data");
    });

    test("应该提取 data 包装结构中的 data", () => {
      const response = { data: "wrapped data" };
      expect(extractApiData(response)).toBe("wrapped data");
    });

    test("如果响应本身就是数据，应该直接返回", () => {
      const response = "raw data";
      expect(extractApiData(response)).toBe("raw data");
    });

    test("应该处理复杂对象类型", () => {
      const response: ApiResponse<{ id: number; name: string }> = {
        code: 200,
        message: "success",
        data: { id: 1, name: "test" },
      };
      expect(extractApiData(response)).toEqual({ id: 1, name: "test" });
    });

    test("应该处理 null 响应", () => {
      expect(extractApiData(null)).toBeNull();
    });

    test("应该处理 undefined 响应", () => {
      expect(extractApiData(undefined)).toBeUndefined();
    });
  });

  describe("extractPaginatedData", () => {
    test("应该处理标准分页响应", () => {
      const response: PaginatedResponse<string> = {
        items: ["a", "b", "c"],
        total: 3,
        page: 1,
        page_size: 10,
      };
      const result = extractPaginatedData(response);
      expect(result.items).toEqual(["a", "b", "c"]);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(10);
    });

    test("应该处理数组响应", () => {
      const response = ["a", "b", "c"];
      const result = extractPaginatedData(response);
      expect(result.items).toEqual(["a", "b", "c"]);
      expect(result.total).toBeUndefined();
    });

    test("应该处理 ApiResponse 包装的分页数据", () => {
      const response: ApiResponse<PaginatedResponse<number>> = {
        code: 200,
        message: "success",
        data: {
          items: [1, 2, 3],
          total: 3,
          page: 1,
          page_size: 10,
        },
      };
      const result = extractPaginatedData(response);
      expect(result.items).toEqual([1, 2, 3]);
      expect(result.total).toBe(3);
    });

    test("空数组应该返回空 items", () => {
      const response: PaginatedResponse<string> = {
        items: [],
        total: 0,
        page: 1,
        page_size: 10,
      };
      const result = extractPaginatedData(response);
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    test("无效响应应该返回空 items", () => {
      const result = extractPaginatedData({ invalid: true });
      expect(result.items).toEqual([]);
    });
  });

  describe("createSuccessResponse", () => {
    test("应该创建成功响应", () => {
      const result = createSuccessResponse({ id: 1 });
      expect(result).toEqual({
        success: true,
        data: { id: 1 },
      });
    });

    test("应该处理 null 数据", () => {
      const result = createSuccessResponse(null);
      expect(result).toEqual({
        success: true,
        data: null,
      });
    });
  });

  describe("createErrorResponse", () => {
    test("应该创建错误响应", () => {
      const result = createErrorResponse("操作失败");
      expect(result).toEqual({
        success: false,
        message: "操作失败",
        error: undefined,
      });
    });

    test("应该包含错误代码", () => {
      const result = createErrorResponse("操作失败", "ERR_001");
      expect(result).toEqual({
        success: false,
        message: "操作失败",
        error: "ERR_001",
      });
    });
  });
});
