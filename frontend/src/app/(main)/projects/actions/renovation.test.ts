import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient, createSuccessResponse } from "@/test/server-action-helpers";
import {
  deleteRenovationPhotoAction,
  getRenovationPhotosAction,
  addRenovationPhotoAction,
  updateRenovationStageAction,
  getRenovationContractAction,
  updateRenovationContractAction,
} from "./renovation";

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

describe("renovation actions", () => {
  let client: ReturnType<typeof createMockFetchClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockFetchClient();
    mockFetchClient.mockResolvedValue(client);
  });

  // ── deleteRenovationPhotoAction ────────────────────────────────────────

  describe("deleteRenovationPhotoAction", () => {
    it("成功删除装修照片", async () => {
      client.DELETE.mockResolvedValue({ data: null, error: null });

      const result = await deleteRenovationPhotoAction("1", "p1");

      expect(result).toEqual({ success: true, message: "照片已删除" });
      expect(client.DELETE).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation/photos/{photo_id}",
        { params: { path: { project_id: "1", photo_id: "p1" } } },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.DELETE.mockResolvedValue({
        data: null,
        error: { detail: "照片不存在" },
      });

      const result = await deleteRenovationPhotoAction("1", "p999");

      expect(result).toEqual({ success: false, message: "照片不存在" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.DELETE.mockResolvedValue({ data: null, error: {} });

      const result = await deleteRenovationPhotoAction("1", "p1");

      expect(result).toEqual({ success: false, message: "删除照片失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await deleteRenovationPhotoAction("1", "p1");

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── getRenovationPhotosAction ──────────────────────────────────────────

  describe("getRenovationPhotosAction", () => {
    it("成功获取装修照片列表", async () => {
      const photos = [
        { id: "p1", url: "https://example.com/1.jpg" },
        { id: "p2", url: "https://example.com/2.jpg" },
      ];
      const apiResponse = createSuccessResponse({ items: photos, total: 2 });
      client.GET.mockResolvedValue({ data: apiResponse, error: null });

      const result = await getRenovationPhotosAction("1");

      expect(result).toEqual({ success: true, data: photos });
      expect(client.GET).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation/photos",
        { params: { path: { project_id: "1" } } },
      );
    });

    it("返回数据无 items 时返回空数组", async () => {
      const apiResponse = createSuccessResponse({ total: 0 });
      client.GET.mockResolvedValue({ data: apiResponse, error: null });

      const result = await getRenovationPhotosAction("1");

      expect(result).toEqual({ success: true, data: [] });
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.GET.mockResolvedValue({
        data: null,
        error: { detail: "项目不存在" },
      });

      const result = await getRenovationPhotosAction("999");

      expect(result).toEqual({ success: false, message: "项目不存在" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.GET.mockResolvedValue({ data: null, error: {} });

      const result = await getRenovationPhotosAction("1");

      expect(result).toEqual({ success: false, message: "获取照片失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await getRenovationPhotosAction("1");

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── addRenovationPhotoAction ───────────────────────────────────────────

  describe("addRenovationPhotoAction", () => {
    it("成功添加装修照片", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      const result = await addRenovationPhotoAction({
        projectId: "1",
        stage: "demolition",
        url: "https://example.com/photo.jpg",
        filename: "photo.jpg",
      });

      expect(result).toEqual({ success: true, message: "上传成功" });
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation/photos",
        {
          params: {
            path: { project_id: "1" },
            query: {
              stage: "demolition",
              url: "https://example.com/photo.jpg",
              filename: "photo.jpg",
            },
          },
        },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("不传 filename 时 query 中 filename 为 undefined", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      await addRenovationPhotoAction({
        projectId: "1",
        stage: "painting",
        url: "https://example.com/photo.jpg",
      });

      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation/photos",
        {
          params: {
            path: { project_id: "1" },
            query: {
              stage: "painting",
              url: "https://example.com/photo.jpg",
              filename: undefined,
            },
          },
        },
      );
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.POST.mockResolvedValue({
        data: null,
        error: { detail: "URL 无效" },
      });

      const result = await addRenovationPhotoAction({
        projectId: "1",
        stage: "demolition",
        url: "bad-url",
      });

      expect(result).toEqual({ success: false, message: "URL 无效" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.POST.mockResolvedValue({ data: null, error: {} });

      const result = await addRenovationPhotoAction({
        projectId: "1",
        stage: "demolition",
        url: "https://example.com/photo.jpg",
      });

      expect(result).toEqual({ success: false, message: "上传照片记录失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await addRenovationPhotoAction({
        projectId: "1",
        stage: "demolition",
        url: "https://example.com/photo.jpg",
      });

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── updateRenovationStageAction ────────────────────────────────────────

  describe("updateRenovationStageAction", () => {
    it("成功更新装修阶段", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null });

      const result = await updateRenovationStageAction({
        projectId: "1",
        renovation_stage: "painting",
      });

      expect(result).toEqual({ success: true, message: "阶段更新成功" });
      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation",
        {
          params: { path: { project_id: "1" } },
          body: {
            renovation_stage: "painting",
            stage_completed_at: undefined,
          },
        },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("携带 stage_completed_at 参数", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null });

      await updateRenovationStageAction({
        projectId: "1",
        renovation_stage: "painting",
        stage_completed_at: "2024-06-01",
      });

      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation",
        {
          params: { path: { project_id: "1" } },
          body: {
            renovation_stage: "painting",
            stage_completed_at: "2024-06-01",
          },
        },
      );
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.PUT.mockResolvedValue({
        data: null,
        error: { detail: "阶段无效" },
      });

      const result = await updateRenovationStageAction({
        projectId: "1",
        renovation_stage: "invalid",
      });

      expect(result).toEqual({ success: false, message: "阶段无效" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.PUT.mockResolvedValue({ data: null, error: {} });

      const result = await updateRenovationStageAction({
        projectId: "1",
        renovation_stage: "painting",
      });

      expect(result).toEqual({ success: false, message: "更新阶段失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await updateRenovationStageAction({
        projectId: "1",
        renovation_stage: "painting",
      });

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── getRenovationContractAction ────────────────────────────────────────

  describe("getRenovationContractAction", () => {
    it("成功获取装修合同信息", async () => {
      const contract = { contractor: "装修公司A", amount: 50000 };
      const apiResponse = createSuccessResponse(contract);
      client.GET.mockResolvedValue({ data: apiResponse, error: null });

      const result = await getRenovationContractAction("1");

      expect(result).toEqual({ success: true, data: contract });
      expect(client.GET).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation/contract",
        { params: { path: { project_id: "1" } } },
      );
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.GET.mockResolvedValue({
        data: null,
        error: { detail: "合同不存在" },
      });

      const result = await getRenovationContractAction("999");

      expect(result).toEqual({ success: false, message: "合同不存在" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.GET.mockResolvedValue({ data: null, error: {} });

      const result = await getRenovationContractAction("1");

      expect(result).toEqual({ success: false, message: "获取装修合同信息失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await getRenovationContractAction("1");

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── updateRenovationContractAction ─────────────────────────────────────

  describe("updateRenovationContractAction", () => {
    it("成功更新装修合同信息", async () => {
      const contract = { contractor: "装修公司B", amount: 60000 };
      const apiResponse = createSuccessResponse(contract);
      client.PUT.mockResolvedValue({ data: apiResponse, error: null });

      const result = await updateRenovationContractAction("1", {
        contractor: "装修公司B",
        amount: 60000,
      });

      expect(result).toEqual({
        success: true,
        data: contract,
        message: "装修合同信息已更新",
      });
      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/renovation/contract",
        {
          params: { path: { project_id: "1" } },
          body: { contractor: "装修公司B", amount: 60000 },
        },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.PUT.mockResolvedValue({
        data: null,
        error: { detail: "参数错误" },
      });

      const result = await updateRenovationContractAction("1", {});

      expect(result).toEqual({ success: false, message: "参数错误" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.PUT.mockResolvedValue({ data: null, error: {} });

      const result = await updateRenovationContractAction("1", {});

      expect(result).toEqual({ success: false, message: "更新装修合同信息失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await updateRenovationContractAction("1", {});

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });
});
