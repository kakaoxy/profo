import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient } from "@/test/server-action-helpers";
import {
  getRolesAction,
  createRoleAction,
  updateRoleAction,
  deleteRoleAction,
} from "./role-actions";

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

const mockRoleResponse = {
  id: "role-1",
  name: "管理员",
  code: "admin",
  is_active: true,
  permissions: [],
  created_at: "2025-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRolesAction", () => {
  it("成功获取角色列表", async () => {
    const listData = { items: [mockRoleResponse], total: 1 };
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: listData, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getRolesAction({ page: 1, page_size: 10 });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(listData);
    }
  });

  it("带查询参数调用", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({
        data: { items: [], total: 0 },
        error: null,
      }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    await getRolesAction({
      page: 1,
      page_size: 20,
      name: "管理",
      code: "admin",
      is_active: true,
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/roles/", {
      params: {
        query: {
          page: 1,
          page_size: 20,
          name: "管理",
          code: "admin",
          is_active: true,
        },
      },
    });
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "查询失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getRolesAction({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("获取角色列表失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("超时"));

    const result = await getRolesAction({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("createRoleAction", () => {
  const createData = { name: "运营", code: "operator", permission_ids: [] };

  it("成功创建角色并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createRoleAction(createData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("角色创建成功");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users/roles");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      POST: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "角色编码已存在" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createRoleAction(createData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("角色编码已存在");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createRoleAction(createData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("创建角色失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await createRoleAction(createData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("updateRoleAction", () => {
  const updateData = { name: "高级运营" };

  it("成功更新角色并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateRoleAction("role-1", updateData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("角色更新成功");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users/roles");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "角色名称重复" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateRoleAction("role-1", updateData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("角色名称重复");
    }
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateRoleAction("role-1", updateData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("更新角色失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await updateRoleAction("role-1", updateData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("deleteRoleAction", () => {
  it("成功删除角色并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteRoleAction("role-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("角色删除成功");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users/roles");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "角色下仍有用户" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteRoleAction("role-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("角色下仍有用户");
    }
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteRoleAction("role-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("删除角色失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await deleteRoleAction("role-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});
