import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient } from "@/test/server-action-helpers";
import {
  getApiKeyInfoAction,
  generateApiKeyAction,
  deleteApiKeyAction,
} from "./actions";

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

const mockApiKeyInfo = {
  id: "key-1",
  name: "default",
  prefix: "pk_abc",
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
  expires_at: null,
};

const mockApiKeyCreateResponse = {
  id: "key-2",
  key: "pk_full_secret_key_value",
  prefix: "pk_def",
  name: "default",
  is_active: true,
  created_at: "2025-06-01T00:00:00Z",
  expires_at: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getApiKeyInfoAction", () => {
  it("成功获取 API Key 信息", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: mockApiKeyInfo, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getApiKeyInfoAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockApiKeyInfo);
    }
    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/auth/api-key");
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "未找到" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getApiKeyInfoAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("获取 API Key 信息失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("连接超时"));

    const result = await getApiKeyInfoAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("generateApiKeyAction", () => {
  it("成功生成 API Key", async () => {
    const mockClient = createMockFetchClient({
      POST: vi
        .fn()
        .mockResolvedValue({ data: mockApiKeyCreateResponse, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await generateApiKeyAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockApiKeyCreateResponse);
    }
    expect(mockClient.POST).toHaveBeenCalledWith("/api/v1/auth/api-key");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      POST: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "已达上限" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await generateApiKeyAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("已达上限");
    }
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await generateApiKeyAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("生成 API Key 失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await generateApiKeyAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("deleteApiKeyAction", () => {
  it("成功删除 API Key 并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteApiKeyAction();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("API Key 已删除");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings/api-key");
    expect(mockClient.DELETE).toHaveBeenCalledWith("/api/v1/auth/api-key");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "Key 不存在" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteApiKeyAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("Key 不存在");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteApiKeyAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("删除 API Key 失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await deleteApiKeyAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});
