import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient } from "@/test/server-action-helpers";
import {
  addFollowUpAction,
  getLeadFollowUpsAction,
  getLeadPriceHistoryAction,
} from "./follow-up-actions";

vi.mock("@/lib/api-server", () => ({
  fetchClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const mockFetchClient = vi.mocked(
  (await import("@/lib/api-server")).fetchClient
);
const mockRevalidatePath = vi.mocked(
  (await import("next/cache")).revalidatePath
);

const mockFollowUpBackend = {
  id: "fu-1",
  lead_id: "lead-1",
  method: "phone",
  content: "电话沟通，客户有意向",
  followed_at: "2025-03-01T10:00:00Z",
  created_by_name: "张三",
};

const mockPriceHistoryBackend = {
  id: "ph-1",
  lead_id: "lead-1",
  price: 280,
  remark: "市场评估价",
  recorded_at: "2025-03-01T10:00:00Z",
  created_by_name: "李四",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addFollowUpAction", () => {
  it("成功添加跟进记录并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await addFollowUpAction("lead-1", "phone", "电话沟通");

    expect(result.success).toBe(true);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/leads");
    expect(mockClient.POST).toHaveBeenCalledWith(
      "/api/v1/leads/{lead_id}/follow-ups",
      {
        params: { path: { lead_id: "lead-1" } },
        body: { method: "phone", content: "电话沟通" },
      }
    );
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      POST: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "添加失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await addFollowUpAction("lead-1", "wechat", "微信跟进");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("添加失败");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("fetchClient 抛出异常时返回失败结果", async () => {
    mockFetchClient.mockRejectedValue(new Error("网络断开"));

    const result = await addFollowUpAction("lead-1", "face", "面谈");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("网络断开");
    }
  });
});

describe("getLeadFollowUpsAction", () => {
  it("成功获取跟进记录列表", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: [mockFollowUpBackend],
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadFollowUpsAction("lead-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("fu-1");
    expect(result[0].leadId).toBe("lead-1");
    expect(result[0].method).toBe("phone");
    expect(result[0].content).toBe("电话沟通，客户有意向");
    expect(result[0].createdBy).toBe("张三");
    expect(mockClient.GET).toHaveBeenCalledWith(
      "/api/v1/leads/{lead_id}/follow-ups",
      {
        params: { path: { lead_id: "lead-1" } },
      }
    );
  });

  it("created_by_name 为空时回退为 Unknown", async () => {
    const backendNoName = { ...mockFollowUpBackend, created_by_name: null };
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: [backendNoName],
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadFollowUpsAction("lead-1");

    expect(result[0].createdBy).toBe("Unknown");
  });

  it("API 返回错误时返回空数组", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "查询失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadFollowUpsAction("lead-1");

    expect(result).toEqual([]);
  });

  it("API 返回空数据时返回空数组", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadFollowUpsAction("lead-1");

    expect(result).toEqual([]);
  });
});

describe("getLeadPriceHistoryAction", () => {
  it("成功获取价格历史记录", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: [mockPriceHistoryBackend],
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadPriceHistoryAction("lead-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ph-1");
    expect(result[0].leadId).toBe("lead-1");
    expect(result[0].price).toBe(280);
    expect(result[0].remark).toBe("市场评估价");
    expect(result[0].createdByName).toBe("李四");
    expect(mockClient.GET).toHaveBeenCalledWith(
      "/api/v1/leads/{lead_id}/prices",
      {
        params: { path: { lead_id: "lead-1" } },
      }
    );
  });

  it("remark 和 created_by_name 为 null 时转为 undefined", async () => {
    const backendNulls = {
      ...mockPriceHistoryBackend,
      remark: null,
      created_by_name: null,
    };
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: [backendNulls],
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadPriceHistoryAction("lead-1");

    expect(result[0].remark).toBeUndefined();
    expect(result[0].createdByName).toBeUndefined();
  });

  it("API 返回错误时返回空数组", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "查询失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadPriceHistoryAction("lead-1");

    expect(result).toEqual([]);
  });

  it("API 返回空数据时返回空数组", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getLeadPriceHistoryAction("lead-1");

    expect(result).toEqual([]);
  });
});
