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
  revalidateTag: vi.fn(),
}));

import {
  getL4MarketingMediaAction,
  createL4MarketingMediaAction,
  updateL4MarketingMediaAction,
  deleteL4MarketingMediaAction,
  batchAddL4PhotosAction,
  batchUpdateMediaSortOrderAction,
} from "./media";

// ---------------------------------------------------------------------------
// 测试数据
// ---------------------------------------------------------------------------

const mockMedia = {
  id: 10,
  project_id: 1,
  file_url: "https://example.com/photo.jpg",
  media_type: "image",
  photo_category: "marketing",
  sort_order: 0,
};

const mockMediaList = {
  items: [mockMedia],
  total: 1,
  page: 1,
  page_size: 100,
};

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("媒体管理 Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getL4MarketingMediaAction
  // =========================================================================
  describe("getL4MarketingMediaAction", () => {
    it("成功获取媒体列表", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: mockMediaList, error: null });

      const result = await getL4MarketingMediaAction(1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockMediaList);
      }
      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/projects/{project_id}/media",
        expect.objectContaining({
          params: {
            path: { project_id: 1 },
            query: { page: 1, page_size: 100 },
          },
        }),
      );
    });

    it("传入分页参数时正确传递", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: mockMediaList, error: null });

      await getL4MarketingMediaAction(1, 2, 50);

      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/projects/{project_id}/media",
        expect.objectContaining({
          params: {
            path: { project_id: 1 },
            query: { page: 2, page_size: 50 },
          },
        }),
      );
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "项目不存在" };
      mockClient.GET.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await getL4MarketingMediaAction(999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("项目不存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.GET.mockRejectedValueOnce(new Error("fetch failed"));

      const result = await getL4MarketingMediaAction(1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });

  // =========================================================================
  // createL4MarketingMediaAction
  // =========================================================================
  describe("createL4MarketingMediaAction", () => {
    const createBody = {
      file_url: "https://example.com/new.jpg",
      media_type: "image" as const,
      photo_category: "marketing" as const,
      origin_media_id: 5,
      renovation_stage: "other" as const,
      sort_order: 0,
    };

    it("成功创建媒体并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      mockClient.POST.mockResolvedValueOnce({ data: mockMedia, error: null });

      const result = await createL4MarketingMediaAction(1, createBody);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockMedia);
      }
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-project-1", { expire: 0 });
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "媒体已存在" };
      mockClient.POST.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await createL4MarketingMediaAction(1, createBody);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("媒体已存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.POST.mockRejectedValueOnce(new Error("network error"));

      const result = await createL4MarketingMediaAction(1, createBody);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });

  // =========================================================================
  // updateL4MarketingMediaAction
  // =========================================================================
  describe("updateL4MarketingMediaAction", () => {
    const updateBody = { sort_order: 5 };

    it("成功更新媒体并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      const updatedMedia = { ...mockMedia, sort_order: 5 };
      mockClient.PUT.mockResolvedValueOnce({ data: updatedMedia, error: null });

      const result = await updateL4MarketingMediaAction(10, 1, updateBody as never);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updatedMedia);
      }
      expect(mockClient.PUT).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/media/{media_id}",
        { params: { path: { media_id: 10 } }, body: updateBody },
      );
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-project-1", { expire: 0 });
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { message: "媒体不存在" };
      mockClient.PUT.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await updateL4MarketingMediaAction(999, 1, updateBody as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("媒体不存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.PUT.mockRejectedValueOnce(new Error("timeout occurred"));

      const result = await updateL4MarketingMediaAction(10, 1, updateBody as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("请求超时，请稍后重试");
      }
    });
  });

  // =========================================================================
  // deleteL4MarketingMediaAction
  // =========================================================================
  describe("deleteL4MarketingMediaAction", () => {
    it("成功删除媒体并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      mockClient.DELETE.mockResolvedValueOnce({ data: null, error: null });

      const result = await deleteL4MarketingMediaAction(10, 1);

      expect(result.success).toBe(true);
      expect(mockClient.DELETE).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/media/{media_id}",
        { params: { path: { media_id: 10 } } },
      );
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-project-1", { expire: 0 });
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "媒体不存在" };
      mockClient.DELETE.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await deleteL4MarketingMediaAction(999, 1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("媒体不存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.DELETE.mockRejectedValueOnce(new Error("network failure"));

      const result = await deleteL4MarketingMediaAction(10, 1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });

  // =========================================================================
  // batchAddL4PhotosAction
  // =========================================================================
  describe("batchAddL4PhotosAction", () => {
    it("全部成功时返回所有结果", async () => {
      const { revalidateTag } = await import("next/cache");
      const media1 = { ...mockMedia, id: 11, sort_order: 0 };
      const media2 = { ...mockMedia, id: 12, sort_order: 1 };

      mockClient.POST
        .mockResolvedValueOnce({ data: media1, error: null })
        .mockResolvedValueOnce({ data: media2, error: null });

      const result = await batchAddL4PhotosAction(1, [101, 102]);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data![0]).toEqual(media1);
        expect(result.data![1]).toEqual(media2);
      }
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-project-1", { expire: 0 });
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("部分失败时返回部分成功结果和错误信息", async () => {
      const media1 = { ...mockMedia, id: 11, sort_order: 0 };

      mockClient.POST
        .mockResolvedValueOnce({ data: media1, error: null })
        .mockResolvedValueOnce({ data: null, error: { detail: "照片不存在" } });

      const result = await batchAddL4PhotosAction(1, [101, 102]);

      expect(result.success).toBe(true); // 有部分成功
      if ("data" in result && result.data) {
        expect(result.data).toHaveLength(1);
      }
      if ("error" in result && result.error) {
        expect(result.error).toContain("ID: 102");
      }
    });

    it("全部失败时返回失败结果", async () => {
      mockClient.POST
        .mockResolvedValueOnce({ data: null, error: { detail: "照片不存在" } })
        .mockResolvedValueOnce({ data: null, error: { detail: "照片不存在" } });

      const result = await batchAddL4PhotosAction(1, [101, 102]);

      expect(result.success).toBe(false);
      if ("error" in result && result.error) {
        expect(result.error).toContain("ID: 101");
        expect(result.error).toContain("ID: 102");
      }
    });

    it("空照片列表时返回空结果", async () => {
      const { revalidateTag } = await import("next/cache");

      const result = await batchAddL4PhotosAction(1, []);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(0);
      }
      expect(revalidateTag).toHaveBeenCalled();
    });

    it("创建时 sort_order 递增", async () => {
      const media0 = { ...mockMedia, id: 11, sort_order: 0 };
      const media1 = { ...mockMedia, id: 12, sort_order: 1 };
      const media2 = { ...mockMedia, id: 13, sort_order: 2 };

      mockClient.POST
        .mockResolvedValueOnce({ data: media0, error: null })
        .mockResolvedValueOnce({ data: media1, error: null })
        .mockResolvedValueOnce({ data: media2, error: null });

      await batchAddL4PhotosAction(1, [101, 102, 103]);

      // 验证每次 POST 的 body 中 sort_order 递增
      expect(mockClient.POST).toHaveBeenCalledTimes(3);
      const calls = mockClient.POST.mock.calls as Array<[string, { body: { sort_order: number } }]>;
      expect(calls[0][1].body.sort_order).toBe(0);
      expect(calls[1][1].body.sort_order).toBe(1);
      expect(calls[2][1].body.sort_order).toBe(2);
    });
  });

  // =========================================================================
  // batchUpdateMediaSortOrderAction
  // =========================================================================
  describe("batchUpdateMediaSortOrderAction", () => {
    const sortUpdates = [
      { media_id: 10, sort_order: 0 },
      { media_id: 11, sort_order: 1 },
    ];

    it("成功更新排序并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      const responseData = { updated: 2 };
      mockClient.PUT.mockResolvedValueOnce({ data: responseData, error: null });

      const result = await batchUpdateMediaSortOrderAction(1, sortUpdates);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(responseData);
      }
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-project-1", { expire: 0 });
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      mockClient.PUT.mockResolvedValueOnce({ data: null, error: { detail: "排序失败" } });

      const result = await batchUpdateMediaSortOrderAction(1, sortUpdates);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("排序失败");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.PUT.mockRejectedValueOnce(new Error("network error"));

      const result = await batchUpdateMediaSortOrderAction(1, sortUpdates);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });
});
