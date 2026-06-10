import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient } from "@/test/server-action-helpers";
import {
  createLeadAction,
  getLeadsAction,
  updateLeadAction,
  deleteLeadAction,
} from "./lead-actions";
import { LeadStatus } from "../types";

vi.mock("@/lib/api-server", () => ({
  fetchClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockFetchClient = vi.mocked(
  await import("@/lib/api-server")
).fetchClient;
const mockRevalidatePath = vi.mocked(
  (await import("next/cache")).revalidatePath
);

const mockBackendLead = {
  id: "lead-1",
  community_name: "阳光花园",
  community_id: "comm-1",
  layout: "2室1厅",
  orientation: "南",
  floor_info: "18/24层",
  area: 89,
  total_price: 300,
  unit_price: 33707,
  status: "pending_assessment",
  eval_price: 280,
  audit_reason: null,
  auditor_id: null,
  audit_time: null,
  images: [],
  district: "浦东",
  business_area: "陆家嘴",
  remarks: "好房",
  creator_name: "张三",
  last_follow_up_at: null,
  created_at: "2025-01-01T00:00:00Z",
};

const mockLeadInput = {
  communityName: "阳光花园",
  communityId: "comm-1",
  layout: "2室1厅",
  orientation: "南",
  floorInfo: "18/24层",
  area: 89,
  totalPrice: 300,
  unitPrice: 33707,
  status: LeadStatus.PENDING_ASSESSMENT,
  evalPrice: 280,
  district: "浦东",
  businessArea: "陆家嘴",
  remarks: "好房",
  images: [],
  creatorName: "张三",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createLeadAction", () => {
  it("成功创建线索并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: mockBackendLead, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createLeadAction(mockLeadInput);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("lead-1");
      expect(result.data.communityName).toBe("阳光花园");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leads");
    expect(mockClient.POST).toHaveBeenCalledWith("/api/v1/leads/", {
      body: expect.objectContaining({
        community_name: "阳光花园",
        is_hot: 0,
        images: [],
      }),
    });
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      POST: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "创建失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createLeadAction(mockLeadInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("创建失败");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fetchClient 抛出异常时返回失败结果", async () => {
    mockFetchClient.mockRejectedValue(new Error("网络错误"));

    const result = await createLeadAction(mockLeadInput);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("网络错误");
    }
  });
});

describe("getLeadsAction", () => {
  it("成功获取线索列表", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: { items: [mockBackendLead] },
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadsAction({
      search: "",
      statuses: [],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0].communityName).toBe("阳光花园");
    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/leads/", {
      params: {
        query: expect.objectContaining({ page: 1, page_size: 100 }),
      },
    });
  });

  it("带搜索和状态过滤参数", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: { items: [] },
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    await getLeadsAction({
      search: "阳光",
      statuses: [LeadStatus.PENDING_ASSESSMENT],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/leads/", {
      params: {
        query: expect.objectContaining({
          search: "阳光",
          statuses: [LeadStatus.PENDING_ASSESSMENT],
        }),
      },
    });
  });

  it("API 返回错误时返回空数组", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "查询失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadsAction({
      search: "",
      statuses: [],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    });

    expect(result).toEqual([]);
  });

  it("API 返回空 items 时返回空数组", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: { items: null },
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadsAction({
      search: "",
      statuses: [],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    });

    expect(result).toEqual([]);
  });
});

describe("updateLeadAction", () => {
  it("成功更新线索并调用 revalidatePath", async () => {
    const updatedBackend = { ...mockBackendLead, community_name: "月亮湾" };
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: updatedBackend, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateLeadAction("lead-1", {
      communityName: "月亮湾",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.communityName).toBe("月亮湾");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leads");
    expect(mockClient.PUT).toHaveBeenCalledWith(
      "/api/v1/leads/{lead_id}",
      expect.objectContaining({
        params: { path: { lead_id: "lead-1" } },
        body: { community_name: "月亮湾" },
      })
    );
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "更新失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateLeadAction("lead-1", { communityName: "月亮湾" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("更新失败");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fetchClient 抛出异常时返回失败结果", async () => {
    mockFetchClient.mockRejectedValue(new Error("服务器异常"));

    const result = await updateLeadAction("lead-1", { communityName: "月亮湾" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("服务器异常");
    }
  });
});

describe("deleteLeadAction", () => {
  it("成功删除线索并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteLeadAction("lead-1");

    expect(result.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leads");
    expect(mockClient.DELETE).toHaveBeenCalledWith(
      "/api/v1/leads/{lead_id}",
      {
        params: { path: { lead_id: "lead-1" } },
      }
    );
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "删除失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteLeadAction("lead-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("删除失败");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fetchClient 抛出异常时返回失败结果", async () => {
    mockFetchClient.mockRejectedValue(new Error("连接超时"));

    const result = await deleteLeadAction("lead-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("连接超时");
    }
  });
});
