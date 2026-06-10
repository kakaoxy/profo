import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted 确保 mockClient 在 vi.mock 工厂函数中可用
// ---------------------------------------------------------------------------

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    GET: vi.fn().mockResolvedValue({ data: null, error: null }),
    POST: vi.fn().mockResolvedValue({ data: null, error: null }),
    PUT: vi.fn().mockResolvedValue({ data: null, error: null }),
    DELETE: vi.fn().mockResolvedValue({ data: null, error: null }),
    PATCH: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

vi.mock("@/lib/api-server", () => ({
  fetchClient: vi.fn().mockResolvedValue(mockClient),
}));

import { getPropertyDetailAction } from "./actions";

// ---------------------------------------------------------------------------
// 测试数据
// ---------------------------------------------------------------------------

const mockProperty = {
  id: 1,
  name: "测试房产",
  address: "测试地址123号",
  community_id: "c1",
  status: "active",
};

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("房产详情 Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPropertyDetailAction", () => {
    it("成功获取房产详情", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: mockProperty, error: null });

      const result = await getPropertyDetailAction(1);

      expect(result).toEqual(mockProperty);
      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/properties/{property_id}",
        { params: { path: { property_id: 1 } } },
      );
    });

    it("API 返回错误时抛出异常", async () => {
      const apiError = { detail: "房产不存在" };
      mockClient.GET.mockResolvedValueOnce({ data: null, error: apiError });

      await expect(getPropertyDetailAction(999)).rejects.toThrow("获取详情失败");
    });

    it("传入不同 ID 时正确传递路径参数", async () => {
      const anotherProperty = { ...mockProperty, id: 42, name: "另一房产" };
      mockClient.GET.mockResolvedValueOnce({ data: anotherProperty, error: null });

      const result = await getPropertyDetailAction(42);

      expect(result).toEqual(anotherProperty);
      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/properties/{property_id}",
        { params: { path: { property_id: 42 } } },
      );
    });
  });
});
