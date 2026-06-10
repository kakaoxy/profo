import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient, createSuccessResponse } from "@/test/server-action-helpers";
import {
  createProjectAction,
  updateProjectAction,
  deleteProjectAction,
  updateProjectStatusAction,
  getProjectDetailAction,
  getNextContractNoAction,
} from "./core";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFetchClient = vi.fn();

vi.mock("@/lib/api-server", () => ({
  fetchClient: (...args: unknown[]) => mockFetchClient(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  extractApiData: vi.fn((data: unknown) => {
    if (data && typeof data === "object" && "data" in (data as Record<string, unknown>)) {
      return (data as Record<string, unknown>).data;
    }
    return data;
  }),
}));

// ── Tests ──────────────────────────────────────────────────────────────────

describe("core actions", () => {
  let client: ReturnType<typeof createMockFetchClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockFetchClient();
    mockFetchClient.mockResolvedValue(client);
  });

  // ── createProjectAction ────────────────────────────────────────────────

  describe("createProjectAction", () => {
    it("成功创建项目并调用 revalidatePath", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      const result = await createProjectAction({ name: "测试项目" } as never);

      expect(result).toEqual({ success: true, message: "项目创建成功" });
      expect(client.POST).toHaveBeenCalledWith("/api/v1/projects", {
        body: { name: "测试项目" },
      });
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息", async () => {
      client.POST.mockResolvedValue({
        data: null,
        error: { detail: "项目名称重复" },
      });

      const result = await createProjectAction({ name: "重复" } as never);

      expect(result).toEqual({ success: false, message: "项目名称重复" });
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("API 返回错误但无 detail 时使用默认消息", async () => {
      client.POST.mockResolvedValue({
        data: null,
        error: {},
      });

      const result = await createProjectAction({ name: "测试" } as never);

      expect(result).toEqual({ success: false, message: "创建项目失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("Network error"));

      const result = await createProjectAction({ name: "测试" } as never);

      expect(result).toEqual({ success: false, message: "网络错误，请稍后重试" });
    });
  });

  // ── updateProjectAction ────────────────────────────────────────────────

  describe("updateProjectAction", () => {
    it("成功更新项目", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null });

      const result = await updateProjectAction("1", { name: "更新名" } as never);

      expect(result).toEqual({ success: true, message: "项目更新成功" });
      expect(client.PUT).toHaveBeenCalledWith("/api/v1/projects/{project_id}", {
        params: { path: { project_id: "1" } },
        body: { name: "更新名" },
      });
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息", async () => {
      client.PUT.mockResolvedValue({
        data: null,
        error: { detail: "项目不存在" },
      });

      const result = await updateProjectAction("999", {} as never);

      expect(result).toEqual({ success: false, message: "项目不存在" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.PUT.mockResolvedValue({ data: null, error: {} });

      const result = await updateProjectAction("1", {} as never);

      expect(result).toEqual({ success: false, message: "更新项目失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await updateProjectAction("1", {} as never);

      expect(result).toEqual({ success: false, message: "网络错误，请稍后重试" });
    });
  });

  // ── deleteProjectAction ────────────────────────────────────────────────

  describe("deleteProjectAction", () => {
    it("成功删除项目", async () => {
      client.DELETE.mockResolvedValue({ data: null, error: null });

      const result = await deleteProjectAction("1");

      expect(result).toEqual({ success: true, message: "项目已删除" });
      expect(client.DELETE).toHaveBeenCalledWith("/api/v1/projects/{project_id}", {
        params: { path: { project_id: "1" } },
      });
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息", async () => {
      client.DELETE.mockResolvedValue({
        data: null,
        error: { detail: "项目不存在" },
      });

      const result = await deleteProjectAction("999");

      expect(result).toEqual({ success: false, message: "项目不存在" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.DELETE.mockResolvedValue({ data: null, error: {} });

      const result = await deleteProjectAction("1");

      expect(result).toEqual({ success: false, message: "删除项目失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await deleteProjectAction("1");

      expect(result).toEqual({ success: false, message: "网络错误，请稍后重试" });
    });
  });

  // ── updateProjectStatusAction ──────────────────────────────────────────

  describe("updateProjectStatusAction", () => {
    it("成功更新项目状态", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null });

      const result = await updateProjectStatusAction("1", "renovating");

      expect(result).toEqual({ success: true, message: "状态已更新" });
      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/status",
        {
          params: { path: { project_id: "1" } },
          body: {
            status: "renovating",
            listing_date: undefined,
            list_price: undefined,
          },
        },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("携带 listing_date 和 list_price 参数", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null });

      await updateProjectStatusAction("1", "listing", "2024-01-01", 500000);

      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/status",
        {
          params: { path: { project_id: "1" } },
          body: {
            status: "listing",
            listing_date: "2024-01-01",
            list_price: 500000,
          },
        },
      );
    });

    it("API 返回错误时返回失败信息", async () => {
      client.PUT.mockResolvedValue({
        data: null,
        error: { detail: "无效状态" },
      });

      const result = await updateProjectStatusAction("1", "invalid");

      expect(result).toEqual({ success: false, message: "无效状态" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.PUT.mockResolvedValue({ data: null, error: {} });

      const result = await updateProjectStatusAction("1", "renovating");

      expect(result).toEqual({ success: false, message: "状态更新失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await updateProjectStatusAction("1", "renovating");

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── getProjectDetailAction ─────────────────────────────────────────────

  describe("getProjectDetailAction", () => {
    it("成功获取项目详情", async () => {
      const projectData = { id: "1", name: "测试项目" };
      const apiResponse = createSuccessResponse(projectData);
      client.GET.mockResolvedValue({ data: apiResponse, error: null });

      const result = await getProjectDetailAction("1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(projectData);
      expect(client.GET).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}",
        expect.objectContaining({
          params: {
            path: { project_id: "1" },
            query: { full: false },
          },
        }),
      );
    });

    it("isFull=true 时传递查询参数", async () => {
      const apiResponse = createSuccessResponse({ id: "1" });
      client.GET.mockResolvedValue({ data: apiResponse, error: null });

      await getProjectDetailAction("1", true);

      expect(client.GET).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}",
        expect.objectContaining({
          params: {
            path: { project_id: "1" },
            query: { full: true },
          },
        }),
      );
    });

    it("API 返回错误时返回失败", async () => {
      client.GET.mockResolvedValue({ data: null, error: { detail: "不存在" } });

      const result = await getProjectDetailAction("999");

      expect(result).toEqual({ success: false, message: "获取详情失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await getProjectDetailAction("1");

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── getNextContractNoAction ────────────────────────────────────────────

  describe("getNextContractNoAction", () => {
    it("成功获取下一个合同编号", async () => {
      client.GET.mockResolvedValue({ data: "HT-2024-001", error: null });

      const result = await getNextContractNoAction();

      expect(result).toEqual({ success: true, data: "HT-2024-001" });
      expect(client.GET).toHaveBeenCalledWith("/api/v1/projects/contract-no/next");
    });

    it("API 返回错误时返回失败", async () => {
      client.GET.mockResolvedValue({ data: null, error: { detail: "失败" } });

      const result = await getNextContractNoAction();

      expect(result).toEqual({ success: false, message: "获取合同编号失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await getNextContractNoAction();

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });
});
