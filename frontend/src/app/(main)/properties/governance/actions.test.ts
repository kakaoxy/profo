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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { mergeCommunitiesAction } from "./actions";

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("房产治理 Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("mergeCommunitiesAction", () => {
    it("参数缺失时返回参数错误", async () => {
      const result = await mergeCommunitiesAction("", ["c2"]);

      expect(result.success).toBe(false);
      expect(result.message).toBe("参数错误：未选择主小区或被合并小区");
    });

    it("被合并小区列表为空时返回参数错误", async () => {
      const result = await mergeCommunitiesAction("c1", []);

      expect(result.success).toBe(false);
      expect(result.message).toBe("参数错误：未选择主小区或被合并小区");
    });

    it("成功合并小区并刷新缓存", async () => {
      const { revalidatePath } = await import("next/cache");
      const responseData = {
        code: 0,
        message: "success",
        data: { message: "合并成功", affected_properties: 5 },
      };
      mockClient.POST.mockResolvedValueOnce({ data: responseData, error: null });

      const result = await mergeCommunitiesAction("c1", ["c2", "c3"]);

      expect(result.success).toBe(true);
      expect(result.message).toBe("合并成功");
      expect(result.affected_properties).toBe(5);
      expect(revalidatePath).toHaveBeenCalledWith("/properties/governance");
    });

    it("成功合并但响应为 ApiResponse 格式时正确提取数据", async () => {
      const responseData = {
        code: 0,
        message: "success",
        data: { affected_properties: 3 },
      };
      mockClient.POST.mockResolvedValueOnce({ data: responseData, error: null });

      const result = await mergeCommunitiesAction("c1", ["c2"]);

      expect(result.success).toBe(true);
      expect(result.affected_properties).toBe(3);
    });

    it("成功合并但响应无 message 和 affected_properties 时仍返回成功", async () => {
      const responseData = {
        code: 0,
        message: "success",
        data: {},
      };
      mockClient.POST.mockResolvedValueOnce({ data: responseData, error: null });

      const result = await mergeCommunitiesAction("c1", ["c2"]);

      expect(result.success).toBe(true);
      expect(result.message).toBeUndefined();
      expect(result.affected_properties).toBeUndefined();
    });

    it("API 返回 detail 错误时返回对应消息", async () => {
      const apiError = { detail: "主小区不存在" };
      mockClient.POST.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await mergeCommunitiesAction("c1", ["c2"]);

      expect(result.success).toBe(false);
      expect(result.message).toBe("主小区不存在");
    });

    it("API 返回 message 错误时返回对应消息", async () => {
      const apiError = { message: "合并冲突" };
      mockClient.POST.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await mergeCommunitiesAction("c1", ["c2"]);

      expect(result.success).toBe(false);
      expect(result.message).toBe("合并冲突");
    });

    it("API 返回未知格式错误时返回默认消息", async () => {
      mockClient.POST.mockResolvedValueOnce({ data: null, error: {} });

      const result = await mergeCommunitiesAction("c1", ["c2"]);

      expect(result.success).toBe(false);
      expect(result.message).toBe("合并请求失败");
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.POST.mockRejectedValueOnce(new Error("network failure"));

      const result = await mergeCommunitiesAction("c1", ["c2"]);

      expect(result.success).toBe(false);
      expect(result.message).toBe("网络错误，请稍后重试");
    });

    it("正确传递请求体参数", async () => {
      mockClient.POST.mockResolvedValueOnce({
        data: { code: 0, message: "success", data: {} },
        error: null,
      });

      await mergeCommunitiesAction("c1", ["c2", "c3"]);

      expect(mockClient.POST).toHaveBeenCalledWith(
        "/api/v1/admin/communities/merge",
        {
          body: {
            primary_id: "c1",
            merge_ids: ["c2", "c3"],
          },
        },
      );
    });
  });
});
