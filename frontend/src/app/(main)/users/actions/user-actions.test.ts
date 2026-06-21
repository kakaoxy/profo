import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockFetchClient } from "@/test/server-action-helpers";
import {
  getUserByIdAction,
  getUsersAction,
  getUsersSimpleAction,
  createUserAction,
  updateUserAction,
  deleteUserAction,
  resetUserPasswordAction,
} from "./user-actions";

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

const mockUserResponse = {
  id: "user-1",
  username: "admin",
  nickname: "管理员",
  role_id: "role-1",
  is_active: true,
  created_at: "2025-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserByIdAction", () => {
  it("成功获取用户信息", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: mockUserResponse, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getUserByIdAction("user-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(mockUserResponse);
    }
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "用户不存在" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getUserByIdAction("user-999");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("获取用户信息失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("网络断开"));

    const result = await getUserByIdAction("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("getUsersAction", () => {
  it("成功获取用户列表", async () => {
    const listData = { items: [mockUserResponse], total: 1 };
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: listData, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getUsersAction({ page: 1, page_size: 10 });

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

    await getUsersAction({
      page: 2,
      page_size: 20,
      username: "admin",
      role_id: "role-1",
      status: "active",
    });

    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/users", {
      params: {
        query: {
          page: 2,
          page_size: 20,
          username: "admin",
          role_id: "role-1",
          status: "active",
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

    const result = await getUsersAction({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("获取用户列表失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("超时"));

    const result = await getUsersAction({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("getUsersSimpleAction", () => {
  it("成功获取简化用户列表", async () => {
    const simpleData = [{ id: "user-1", nickname: "管理员" }];
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: simpleData, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getUsersSimpleAction({ nickname: "管理" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(simpleData);
    }
  });

  it("不带参数调用", async () => {
    const mockClient = createMockFetchClient({
      GET: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    await getUsersSimpleAction();

    expect(mockClient.GET).toHaveBeenCalledWith("/api/v1/users/simple", {
      params: { query: undefined },
    });
  });

  it("API 返回错误时返回失败结果", async () => {
    const mockClient = createMockFetchClient({
      GET: vi
        .fn()
        .mockResolvedValue({ data: null, error: { detail: "失败" } }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await getUsersSimpleAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("获取用户列表失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await getUsersSimpleAction();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("createUserAction", () => {
  const createData = {
    username: "newuser",
    password: "Pass123!",
    nickname: "新用户",
    role_id: "role-2",
  };

  it("成功创建用户并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createUserAction(createData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("用户创建成功");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      POST: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "用户名已存在" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createUserAction(createData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("用户名已存在");
    }
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      POST: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await createUserAction(createData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("创建用户失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("超时"));

    const result = await createUserAction(createData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("updateUserAction", () => {
  const updateData = { nickname: "更新昵称" };

  it("成功更新用户并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateUserAction("user-1", updateData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("用户更新成功");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "角色不存在" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateUserAction("user-1", updateData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("角色不存在");
    }
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await updateUserAction("user-1", updateData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("更新用户失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await updateUserAction("user-1", updateData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("deleteUserAction", () => {
  it("成功删除用户并调用 revalidatePath", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteUserAction("user-1");

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("用户删除成功");
    }
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users");
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "不能删除自己" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteUserAction("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("不能删除自己");
    }
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      DELETE: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await deleteUserAction("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("删除用户失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await deleteUserAction("user-1");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});

describe("resetUserPasswordAction", () => {
  const resetData = { new_password: "NewPass123!" };

  it("成功重置密码", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await resetUserPasswordAction("user-1", resetData);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message).toBe("密码重置成功");
    }
    expect(mockClient.PUT).toHaveBeenCalledWith(
      "/api/v1/users/{user_id}/reset-password",
      {
        params: { path: { user_id: "user-1" } },
        body: resetData,
      }
    );
  });

  it("API 返回带 detail 的错误时提取错误信息", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { detail: "密码强度不足" },
        }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await resetUserPasswordAction("user-1", resetData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("密码强度不足");
    }
  });

  it("API 返回无 detail 的错误时使用默认消息", async () => {
    const mockClient = createMockFetchClient({
      PUT: vi.fn().mockResolvedValue({ data: null, error: {} }),
    });
    mockFetchClient.mockResolvedValue(mockClient);

    const result = await resetUserPasswordAction("user-1", resetData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("重置密码失败");
    }
  });

  it("fetchClient 抛出异常时返回网络错误", async () => {
    mockFetchClient.mockRejectedValue(new Error("异常"));

    const result = await resetUserPasswordAction("user-1", resetData);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toBe("网络错误，请稍后重试");
    }
  });
});
