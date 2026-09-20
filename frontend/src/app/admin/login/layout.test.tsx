// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import LoginLayout from "./layout";

const { mockRedirect, mockGetAccessToken } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockGetAccessToken: vi.fn(),
}));

// Mock next/navigation — redirect 抛 sentinel 中断执行，与真实 Next.js 行为一致
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    throw new Error(`__REDIRECT__${path}`);
  },
}));

// 只 mock 取 token 的工具，避免连带拉起 next/headers 与刷新链路
vi.mock("@/lib/token-refresh-server", () => ({
  getAccessTokenFromCookie: mockGetAccessToken,
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), devDebug: vi.fn() },
}));

/** 桩掉全局 fetch，返回指定状态码的 /me 响应. */
function stubMeResponse(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status })),
  );
}

/** 以 children=null 直接调用 layout（Server Component 即普通 async 函数）. */
function renderLayout(): Promise<unknown> {
  return LoginLayout({ children: null });
}

describe("admin/login/layout — 已登录跳转与重定向环防护", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockGetAccessToken.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("无 access_token → 渲染登录页，不跳转", async () => {
    mockGetAccessToken.mockResolvedValue(null);

    await expect(renderLayout()).resolves.toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("access_token 有效（/me 200）→ redirect('/admin') 必须放行而非被吞掉", async () => {
    mockGetAccessToken.mockResolvedValue("valid-token");
    stubMeResponse(200);

    await expect(renderLayout()).rejects.toThrow("__REDIRECT__/admin");
    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("access_token 过期（/me 401）→ 留在登录页，不得发起 /api/auth/refresh 跳转", async () => {
    mockGetAccessToken.mockResolvedValue("expired-token");
    stubMeResponse(401);

    await expect(renderLayout()).resolves.toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("账号停用（/me 403）→ 留在登录页", async () => {
    mockGetAccessToken.mockResolvedValue("token");
    stubMeResponse(403);

    await expect(renderLayout()).resolves.toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("后端不可用（fetch 抛错）→ 留在登录页，不抛出", async () => {
    mockGetAccessToken.mockResolvedValue("token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(renderLayout()).resolves.toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("鉴权检查不得走 fetchClient 的自动刷新重定向（环的根源）", async () => {
    mockGetAccessToken.mockResolvedValue("expired-token");
    stubMeResponse(401);

    await expect(renderLayout()).resolves.toBeTruthy();
    // 若实现改回 fetchClient，这里会抛 NEXT_REDIRECT 指向 /api/auth/refresh
    expect(mockRedirect).not.toHaveBeenCalledWith(expect.stringContaining("/api/auth/refresh"));
  });
});
