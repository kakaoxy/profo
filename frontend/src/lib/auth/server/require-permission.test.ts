// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

// ─── Hoisted mutable mocks (vi.mock factories can reference these) ──────────
const { mockFetchClient, mockClientGet, mockLoggerError } = vi.hoisted(() => ({
  mockFetchClient: vi.fn(),
  mockClientGet: vi.fn(),
  mockLoggerError: vi.fn(),
}));

// Mock react.cache as passthrough，避免测试环境缺少 React 请求上下文
vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

vi.mock("@/lib/api-server", () => ({
  fetchClient: mockFetchClient,
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: mockLoggerError,
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    devDebug: vi.fn(),
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 构造成功的 /api/v1/auth/me 响应 */
function makeMeResponse(permissions: string[]) {
  return {
    data: {
      id: "1",
      username: "admin",
      permissions,
    },
    error: undefined,
    response: { status: 200 },
  };
}

/** 构造失败的 /api/v1/auth/me 响应（error 非空，data 为空） */
function makeErrorResponse(status: number) {
  return {
    data: undefined,
    error: { message: "error" },
    response: { status },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("requirePermission", () => {
  beforeEach(() => {
    mockFetchClient.mockReset();
    mockClientGet.mockReset();
    mockLoggerError.mockReset();
    // 默认：fetchClient 返回带 GET 方法的 mock client
    mockFetchClient.mockResolvedValue({ GET: mockClientGet });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("有权限时返回 { ok: true }", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse(["user:create", "user:read"]));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission("user:create");

    expect(result).toEqual({ ok: true });
    expect(mockClientGet).toHaveBeenCalledWith("/api/v1/auth/me");
  });

  it("无权限时返回 { ok: false, message: '权限不足：...' }", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse(["user:read"]));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission("user:create");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("权限不足");
      expect(result.message).toContain("user:create");
    }
  });

  it("permissions 为 undefined 时视为无权限", async () => {
    mockClientGet.mockResolvedValue({
      data: { id: "1", username: "admin" },
      error: undefined,
      response: { status: 200 },
    });

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission("user:create");

    expect(result.ok).toBe(false);
  });

  it("401 未登录时返回 { ok: false, message: '登录已过期，请重新登录' }", async () => {
    mockClientGet.mockResolvedValue(makeErrorResponse(401));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission("user:create");

    expect(result).toEqual({ ok: false, message: "登录已过期，请重新登录" });
  });

  it("非 401 错误时返回 { ok: false, message: '权限校验失败' }", async () => {
    mockClientGet.mockResolvedValue(makeErrorResponse(500));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission("user:create");

    expect(result).toEqual({ ok: false, message: "权限校验失败" });
  });

  it("网络异常时返回 { ok: false, message: '权限校验异常' } 并记录日志", async () => {
    mockClientGet.mockRejectedValue(new Error("network error"));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission("user:create");

    expect(result).toEqual({ ok: false, message: "权限校验异常" });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});

describe("requireAnyPermission", () => {
  beforeEach(() => {
    mockFetchClient.mockReset();
    mockClientGet.mockReset();
    mockLoggerError.mockReset();
    mockFetchClient.mockResolvedValue({ GET: mockClientGet });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("持有任一权限即返回 { ok: true }（OR 语义）", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse(["user:read"]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission(["user:create", "user:read"]);

    expect(result).toEqual({ ok: true });
  });

  it("未持有任一权限时返回 { ok: false, message: '权限不足' }", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse(["user:read"]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission(["user:create", "user:delete"]);

    expect(result).toEqual({ ok: false, message: "权限不足" });
  });

  it("空权限码数组时直接返回 { ok: false, message: '权限不足' }，不发起请求", async () => {
    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([]);

    expect(result).toEqual({ ok: false, message: "权限不足" });
    expect(mockClientGet).not.toHaveBeenCalled();
  });

  it("401 未登录时返回 { ok: false, message: '登录已过期，请重新登录' }", async () => {
    mockClientGet.mockResolvedValue(makeErrorResponse(401));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission(["user:create", "user:read"]);

    expect(result).toEqual({ ok: false, message: "登录已过期，请重新登录" });
  });

  it("网络异常时返回 { ok: false, message: '权限校验异常' } 并记录日志", async () => {
    mockClientGet.mockRejectedValue(new Error("network error"));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission(["user:create"]);

    expect(result).toEqual({ ok: false, message: "权限校验异常" });
    expect(mockLoggerError).toHaveBeenCalledTimes(1);
  });
});

// ─── Task 12: Server Action 业务身份透传场景 ─────────────────────────────────
// 前端 requireAnyPermission 放宽校验（任一权限码通过即放行），由后端业务身份兜底。
// "有业务身份" 在前端层等同于 "持有子权限码（如 PROJECT_RENOVATION_UPLOAD_PHOTO）但无 PROJECT_WRITE"。
describe("Task 12: Server Action 业务身份透传", () => {
  beforeEach(() => {
    mockFetchClient.mockReset();
    mockClientGet.mockReset();
    mockLoggerError.mockReset();
    mockFetchClient.mockResolvedValue({ GET: mockClientGet });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("装修 action：user 持有 PROJECT_RENOVATION_UPLOAD_PHOTO 子权限码即放行（无需 PROJECT_WRITE）", async () => {
    mockClientGet.mockResolvedValue(
      makeMeResponse([PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO]),
    );

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_WRITE,
      PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("装修 action：user 持有 PROJECT_RENOVATION_COMPLETE_STAGE 子权限码也放行", async () => {
    mockClientGet.mockResolvedValue(
      makeMeResponse([PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE]),
    );

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_WRITE,
      PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("装修 action：user 无任何装修相关权限码（无业务身份）时拒绝", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_READ]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_WRITE,
      PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("权限不足");
    }
  });

  it("销售 action：user 持有 PROJECT_SALES_ADD_RECORD 子权限码即放行（无需 PROJECT_WRITE）", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_SALES_ADD_RECORD]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
      PERMISSION_CODES.PROJECT_WRITE,
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("销售 action：user 无任何销售相关权限码（无业务身份）时拒绝", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_READ]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
      PERMISSION_CODES.PROJECT_WRITE,
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("权限不足");
    }
  });

  it("updateSalesRolesAction 严格校验：user 持有 PROJECT_SALES_ADD_RECORD 但无 PROJECT_SALES_MANAGE_TEAM 时拒绝", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_SALES_ADD_RECORD]));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission(PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("权限不足");
      expect(result.message).toContain(PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM);
    }
  });

  it("updateSalesRolesAction 严格校验：admin 持有 PROJECT_SALES_MANAGE_TEAM 时放行", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM]));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission(PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM);

    expect(result).toEqual({ ok: true });
  });
});

// ─── Task 14: requirePermission / requireAnyPermission 边界场景补充 ─────────
// 补充覆盖：
// - requireAnyPermission 多权限码全缺失时返回权限不足
// - requireAnyPermission 任一权限码存在即放行（OR 语义）
// - requirePermission 严格单权限校验（仅一个权限码），错误信息包含权限码
// - requirePermission vs requireAnyPermission 行为对比
describe("Task 14: requirePermission / requireAnyPermission 边界场景", () => {
  beforeEach(() => {
    mockFetchClient.mockReset();
    mockClientGet.mockReset();
    mockLoggerError.mockReset();
    mockFetchClient.mockResolvedValue({ GET: mockClientGet });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("requireAnyPermission: 多权限码全部缺失时返回 { ok: false, message: '权限不足' }", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_READ]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
      PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("权限不足");
    }
  });

  it("requireAnyPermission: 多权限码中任一存在即放行（OR 语义，命中第二个）", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_SALES_ADD_RECORD]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
      PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("requireAnyPermission: 多权限码中任一存在即放行（OR 语义，命中最后一个）", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM]));

    const { requireAnyPermission } = await import("./require-permission");
    const result = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
      PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
    ]);

    expect(result).toEqual({ ok: true });
  });

  it("requirePermission: 严格单权限校验，错误信息包含所请求的权限码", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_READ]));

    const { requirePermission } = await import("./require-permission");
    const result = await requirePermission(PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("权限不足");
      expect(result.message).toContain(PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO);
    }
  });

  it("requirePermission vs requireAnyPermission: 持有 PROJECT_WRITE 时均放行", async () => {
    mockClientGet.mockResolvedValue(makeMeResponse([PERMISSION_CODES.PROJECT_WRITE]));

    const { requirePermission, requireAnyPermission } = await import("./require-permission");

    const single = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
    const any = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_WRITE,
    ]);

    expect(single).toEqual({ ok: true });
    expect(any).toEqual({ ok: true });
  });

  it("requirePermission vs requireAnyPermission: 仅持有子权限码时 requirePermission 拒绝，requireAnyPermission 放行", async () => {
    mockClientGet.mockResolvedValue(
      makeMeResponse([PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO]),
    );

    const { requirePermission, requireAnyPermission } = await import("./require-permission");

    // requirePermission 严格校验 PROJECT_WRITE → 拒绝
    const strict = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
    expect(strict.ok).toBe(false);

    // requireAnyPermission OR 校验 → 放行
    const any = await requireAnyPermission([
      PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      PERMISSION_CODES.PROJECT_WRITE,
    ]);
    expect(any).toEqual({ ok: true });
  });
});
