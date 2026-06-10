import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted 确保 mockClient 在 vi.mock 工厂函数中可用
// ---------------------------------------------------------------------------

const { mockClient } = vi.hoisted(() => {
  const fn = () => Promise.resolve(undefined);
  return {
    mockClient: {
      GET: vi.fn().mockResolvedValue({ data: null, error: null }),
      POST: vi.fn().mockResolvedValue({ data: null, error: null }),
      PUT: vi.fn().mockResolvedValue({ data: null, error: null }),
      DELETE: vi.fn().mockResolvedValue({ data: null, error: null }),
      PATCH: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});

vi.mock("@/lib/api-server", () => ({
  fetchClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import {
  getL4MarketingProjectsAction,
  createL4MarketingProjectAction,
  getL4MarketingProjectAction,
  updateL4MarketingProjectAction,
  deleteL4MarketingProjectAction,
} from "./projects";

// ---------------------------------------------------------------------------
// 测试数据
// ---------------------------------------------------------------------------

const mockProject = {
  id: 1,
  title: "测试营销项目",
  project_status: "active",
  publish_status: "draft",
  community_id: "c1",
  consultant_id: "u1",
};

const mockPaginatedData = {
  items: [mockProject],
  total: 1,
  page: 1,
  page_size: 20,
};

// ---------------------------------------------------------------------------
// 测试
// ---------------------------------------------------------------------------

describe("营销项目 Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getL4MarketingProjectsAction
  // =========================================================================
  describe("getL4MarketingProjectsAction", () => {
    it("成功获取项目列表", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: mockPaginatedData, error: null });

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockPaginatedData);
      }
      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/projects",
        expect.objectContaining({
          params: {
            query: {
              page: 1,
              page_size: 20,
              publish_status: undefined,
              project_status: undefined,
              consultant_id: undefined,
              community_id: undefined,
            },
          },
        }),
      );
    });

    it("传入筛选参数时正确传递查询参数", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: mockPaginatedData, error: null });

      await getL4MarketingProjectsAction(2, 10, "published", "active", "u1", "c1");

      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/projects",
        expect.objectContaining({
          params: {
            query: {
              page: 2,
              page_size: 10,
              publish_status: "published",
              project_status: "active",
              consultant_id: "u1",
              community_id: "c1",
            },
          },
        }),
      );
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "项目不存在" };
      mockClient.GET.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("项目不存在");
      }
    });

    it("API 返回验证错误时返回数据验证失败消息", async () => {
      const validationError = {
        detail: [{ loc: ["body", "title"], msg: "字段必填" }],
      };
      mockClient.GET.mockResolvedValueOnce({ data: null, error: validationError });

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("数据验证失败");
      }
    });

    it("API 返回未知格式错误时返回默认消息", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: null, error: {} });

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("操作失败，请稍后重试");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.GET.mockRejectedValueOnce(new Error("fetch failed"));

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });

    it("超时异常时返回超时错误消息", async () => {
      mockClient.GET.mockRejectedValueOnce(new Error("request timeout"));

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("请求超时，请稍后重试");
      }
    });

    it("非 Error 类型的异常时返回默认网络错误消息", async () => {
      mockClient.GET.mockRejectedValueOnce("unknown error");

      const result = await getL4MarketingProjectsAction();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络错误，请稍后重试");
      }
    });
  });

  // =========================================================================
  // createL4MarketingProjectAction
  // =========================================================================
  describe("createL4MarketingProjectAction", () => {
    const createBody = {
      title: "新项目",
      community_id: "c1",
      consultant_id: "u1",
    };

    it("成功创建项目并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      mockClient.POST.mockResolvedValueOnce({ data: mockProject, error: null });

      const result = await createL4MarketingProjectAction(createBody as never);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockProject);
      }
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "标题已存在" };
      mockClient.POST.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await createL4MarketingProjectAction(createBody as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("标题已存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.POST.mockRejectedValueOnce(new Error("network error"));

      const result = await createL4MarketingProjectAction(createBody as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });

  // =========================================================================
  // getL4MarketingProjectAction
  // =========================================================================
  describe("getL4MarketingProjectAction", () => {
    it("成功获取项目详情", async () => {
      mockClient.GET.mockResolvedValueOnce({ data: mockProject, error: null });

      const result = await getL4MarketingProjectAction(1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(mockProject);
      }
      expect(mockClient.GET).toHaveBeenCalledWith(
        "/api/v1/admin/l4-marketing/projects/{project_id}",
        { params: { path: { project_id: 1 } } },
      );
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "项目不存在" };
      mockClient.GET.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await getL4MarketingProjectAction(999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("项目不存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.GET.mockRejectedValueOnce(new Error("timeout occurred"));

      const result = await getL4MarketingProjectAction(1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("请求超时，请稍后重试");
      }
    });
  });

  // =========================================================================
  // updateL4MarketingProjectAction
  // =========================================================================
  describe("updateL4MarketingProjectAction", () => {
    const updateBody = { title: "更新标题" };

    it("成功更新项目并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      const updatedProject = { ...mockProject, title: "更新标题" };
      mockClient.PUT.mockResolvedValueOnce({ data: updatedProject, error: null });

      const result = await updateL4MarketingProjectAction(1, updateBody as never);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(updatedProject);
      }
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-project-1", { expire: 0 });
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { message: "无权限修改" };
      mockClient.PUT.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await updateL4MarketingProjectAction(1, updateBody as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("无权限修改");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.PUT.mockRejectedValueOnce(new Error("fetch error"));

      const result = await updateL4MarketingProjectAction(1, updateBody as never);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });

  // =========================================================================
  // deleteL4MarketingProjectAction
  // =========================================================================
  describe("deleteL4MarketingProjectAction", () => {
    it("成功删除项目并刷新缓存", async () => {
      const { revalidateTag } = await import("next/cache");
      mockClient.DELETE.mockResolvedValueOnce({ data: null, error: null });

      const result = await deleteL4MarketingProjectAction(1);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeUndefined();
      }
      expect(revalidateTag).toHaveBeenCalledWith("l4-marketing-projects", { expire: 0 });
    });

    it("API 返回错误时返回失败结果", async () => {
      const apiError = { detail: "项目不存在" };
      mockClient.DELETE.mockResolvedValueOnce({ data: null, error: apiError });

      const result = await deleteL4MarketingProjectAction(999);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("项目不存在");
      }
    });

    it("网络异常时返回网络错误消息", async () => {
      mockClient.DELETE.mockRejectedValueOnce(new Error("network failure"));

      const result = await deleteL4MarketingProjectAction(1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("网络连接失败，请检查网络后重试");
      }
    });
  });
});
