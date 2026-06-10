import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient, createSuccessResponse } from "@/test/server-action-helpers";
import {
  updateSalesRolesAction,
  getUsersSimpleAction,
  createSalesRecordAction,
  deleteSalesRecordAction,
  completeProjectAction,
} from "./sales";

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

describe("sales actions", () => {
  let client: ReturnType<typeof createMockFetchClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    client = createMockFetchClient();
    mockFetchClient.mockResolvedValue(client);
  });

  // ── updateSalesRolesAction ─────────────────────────────────────────────

  describe("updateSalesRolesAction", () => {
    it("成功更新销售角色（全部字段）", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null, response: { status: 200 } });

      const result = await updateSalesRolesAction("1", {
        channel_manager_id: "u1",
        property_agent_id: "u2",
        negotiator_id: "u3",
      });

      expect(result).toEqual({ success: true, message: "保存成功" });
      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/roles",
        expect.objectContaining({
          params: { path: { project_id: "1" } },
          body: { channel_manager: "u1", presenter: "u2", negotiator: "u3" },
        }),
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("只传部分字段时只映射对应字段", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null, response: { status: 200 } });

      await updateSalesRolesAction("1", { negotiator_id: "u3" });

      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/roles",
        expect.objectContaining({
          body: { negotiator: "u3" },
        }),
      );
    });

    it("传 null 值时正确映射", async () => {
      client.PUT.mockResolvedValue({ data: null, error: null, response: { status: 200 } });

      await updateSalesRolesAction("1", { channel_manager_id: null });

      expect(client.PUT).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/roles",
        expect.objectContaining({
          body: { channel_manager: null },
        }),
      );
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.PUT.mockResolvedValue({
        data: null,
        error: { detail: "权限不足" },
        response: { status: 403 },
      });

      const result = await updateSalesRolesAction("1", { negotiator_id: "u3" });

      expect(result).toEqual({ success: false, message: "权限不足" });
    });

    it("API 返回错误时无 detail 使用状态码消息", async () => {
      client.PUT.mockResolvedValue({
        data: null,
        error: {},
        response: { status: 500 },
      });

      const result = await updateSalesRolesAction("1", { negotiator_id: "u3" });

      expect(result).toEqual({ success: false, message: "更新销售角色失败 (500)" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await updateSalesRolesAction("1", { negotiator_id: "u3" });

      expect(result).toEqual({ success: false, message: "网络错误，请稍后重试" });
    });
  });

  // ── getUsersSimpleAction ───────────────────────────────────────────────

  describe("getUsersSimpleAction", () => {
    it("成功获取用户列表（带 items）", async () => {
      const users = [
        { id: "1", nickname: "张三", username: "zhangsan" },
        { id: "2", nickname: null, username: "lisi" },
      ];
      // getUsersSimpleAction 直接检查 data 上的 "items" 属性，不使用 extractApiData
      client.GET.mockResolvedValue({ data: { items: users, total: 2 }, error: null, response: { status: 200 } });

      const result = await getUsersSimpleAction();

      expect(result).toEqual({ success: true, data: users });
    });

    it("返回数据无 items 字段时返回空数组", async () => {
      client.GET.mockResolvedValue({ data: { total: 0 }, error: null, response: { status: 200 } });

      const result = await getUsersSimpleAction();

      expect(result).toEqual({ success: true, data: [] });
    });

    it("API 返回错误时返回失败信息（含 detail）", async () => {
      client.GET.mockResolvedValue({
        data: null,
        error: { detail: "未授权" },
        response: { status: 401 },
      });

      const result = await getUsersSimpleAction();

      expect(result).toEqual({ success: false, message: "未授权" });
    });

    it("API 返回错误时无 detail 使用状态码消息", async () => {
      client.GET.mockResolvedValue({
        data: null,
        error: {},
        response: { status: 500 },
      });

      const result = await getUsersSimpleAction();

      expect(result).toEqual({ success: false, message: "获取用户列表失败 (500)" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await getUsersSimpleAction();

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── createSalesRecordAction ────────────────────────────────────────────

  describe("createSalesRecordAction", () => {
    const basePayload = {
      projectId: "1",
      recordDate: "2024-01-01",
    };

    it("成功创建带看记录", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "viewing",
        customerName: "客户A",
      });

      expect(result).toEqual({ success: true, message: "记录已添加" });
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/viewings",
        expect.objectContaining({
          params: { path: { project_id: "1" } },
        }),
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("成功创建出价记录", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "offer",
        price: 500000,
      });

      expect(result).toEqual({ success: true, message: "记录已添加" });
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/offers",
        expect.objectContaining({
          params: { path: { project_id: "1" } },
        }),
      );
    });

    it("成功创建面谈记录", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "negotiation",
        notes: "面谈备注",
      });

      expect(result).toEqual({ success: true, message: "记录已添加" });
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/negotiations",
        expect.objectContaining({
          params: { path: { project_id: "1" } },
        }),
      );
    });

    it("请求体包含正确的字段映射", async () => {
      client.POST.mockResolvedValue({ data: null, error: null });

      await createSalesRecordAction({
        ...basePayload,
        recordType: "viewing",
        customerName: "客户A",
        price: 100,
        notes: "备注",
      });

      expect(client.POST).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: {
            record_type: "viewing",
            customer_name: "客户A",
            price: 100,
            record_date: "2024-01-01",
            notes: "备注",
            result: null,
            feedback: null,
          },
        }),
      );
    });

    it("API 返回错误时返回失败信息", async () => {
      client.POST.mockResolvedValue({
        data: null,
        error: { detail: "日期无效" },
      });

      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "viewing",
      });

      expect(result).toEqual({ success: false, message: "日期无效" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.POST.mockResolvedValue({ data: null, error: {} });

      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "viewing",
      });

      expect(result).toEqual({ success: false, message: "添加记录失败" });
    });

    it("未知记录类型时返回错误", async () => {
      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "unknown" as "viewing",
      });

      expect(result).toEqual({ success: false, message: "未知的记录类型" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await createSalesRecordAction({
        ...basePayload,
        recordType: "viewing",
      });

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── deleteSalesRecordAction ────────────────────────────────────────────

  describe("deleteSalesRecordAction", () => {
    it("成功删除销售记录", async () => {
      client.DELETE.mockResolvedValue({ data: null, error: null });

      const result = await deleteSalesRecordAction("1", "r1");

      expect(result).toEqual({ success: true, message: "记录已删除" });
      expect(client.DELETE).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/selling/records/{record_id}",
        {
          params: { path: { project_id: "1", record_id: "r1" } },
        },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息", async () => {
      client.DELETE.mockResolvedValue({
        data: null,
        error: { detail: "记录不存在" },
      });

      const result = await deleteSalesRecordAction("1", "r999");

      expect(result).toEqual({ success: false, message: "记录不存在" });
    });

    it("API 错误无 detail 时使用默认消息", async () => {
      client.DELETE.mockResolvedValue({ data: null, error: {} });

      const result = await deleteSalesRecordAction("1", "r1");

      expect(result).toEqual({ success: false, message: "删除记录失败" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await deleteSalesRecordAction("1", "r1");

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });

  // ── completeProjectAction ──────────────────────────────────────────────

  describe("completeProjectAction", () => {
    it("成功完成项目（成交）", async () => {
      const apiResponse = createSuccessResponse({ id: "1", status: "completed" });
      client.POST.mockResolvedValue({ data: apiResponse, error: null });

      const result = await completeProjectAction("1", {
        soldPrice: 500000,
        soldDate: "2024-06-01",
      });

      expect(result).toEqual({
        success: true,
        message: "恭喜！项目已成交",
        data: { id: "1", status: "completed" },
      });
      expect(client.POST).toHaveBeenCalledWith(
        "/api/v1/projects/{project_id}/complete",
        {
          params: { path: { project_id: "1" } },
          body: { sold_price: 500000, sold_date: "2024-06-01" },
        },
      );
      const { revalidatePath } = await import("next/cache");
      expect(revalidatePath).toHaveBeenCalledWith("/projects");
    });

    it("API 返回错误时返回失败信息", async () => {
      client.POST.mockResolvedValue({
        data: null,
        error: { detail: "操作失败" },
      });

      const result = await completeProjectAction("1", {
        soldPrice: 500000,
        soldDate: "2024-06-01",
      });

      expect(result).toEqual({ success: false, message: "操作失败，请重试" });
    });

    it("网络异常时返回网络错误", async () => {
      mockFetchClient.mockRejectedValue(new Error("fail"));

      const result = await completeProjectAction("1", {
        soldPrice: 500000,
        soldDate: "2024-06-01",
      });

      expect(result).toEqual({ success: false, message: "网络错误" });
    });
  });
});
