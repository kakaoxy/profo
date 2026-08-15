import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import React from "react";
import { SWRConfig } from "swr";
import { usePermission } from "./use-permission";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const { mockFetcher } = vi.hoisted(() => ({
  mockFetcher: vi.fn(),
}));

// Mock @/lib/swr 的 fetcher；保留其他导出避免破坏 import
vi.mock("@/lib/swr", () => ({
  fetcher: mockFetcher,
  AuthError: class AuthError extends Error {
    constructor() {
      super("AUTH_REQUIRED");
      this.name = "AuthError";
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor() {
      super("FORBIDDEN");
      this.name = "ForbiddenError";
    }
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 为每个测试提供独立的 SWR cache，避免跨用例缓存污染。
 */
function makeWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("usePermission", () => {
  beforeEach(() => {
    mockFetcher.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hasPermission 返回 true 当用户持有所查权限", async () => {
    mockFetcher.mockResolvedValue({
      permissions: ["user:read", "user:create"],
    });

    const { result } = renderHook(() => usePermission(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasPermission("user:read")).toBe(true);
    expect(result.current.hasPermission("user:create")).toBe(true);
  });

  it("hasPermission 返回 false 当用户未持有所查权限", async () => {
    mockFetcher.mockResolvedValue({ permissions: ["user:read"] });

    const { result } = renderHook(() => usePermission(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.hasPermission("user:delete")).toBe(false);
    expect(result.current.hasPermission("")).toBe(false);
  });

  it("hasAnyPermission 任一满足即返回 true，全不满足返回 false", async () => {
    mockFetcher.mockResolvedValue({ permissions: ["user:read"] });

    const { result } = renderHook(() => usePermission(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // 命中一个
    expect(result.current.hasAnyPermission(["user:delete", "user:read"])).toBe(true);
    // 全部未命中
    expect(result.current.hasAnyPermission(["user:delete", "user:update"])).toBe(false);
    // 空列表视为不满足
    expect(result.current.hasAnyPermission([])).toBe(false);
  });

  it("permissions 为空时所有判断均返回 false", async () => {
    // 后端可能返回 permissions: null 或缺失字段
    mockFetcher.mockResolvedValue({ permissions: null });

    const { result } = renderHook(() => usePermission(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.permissions).toEqual([]);
    expect(result.current.hasPermission("user:read")).toBe(false);
    expect(result.current.hasAnyPermission(["user:read"])).toBe(false);
  });

  it("多次渲染时 permissions 与回调引用保持稳定（useMemo/useCallback 生效）", async () => {
    // 关键：mockFetcher 返回同一个对象引用，模拟 SWR 缓存命中时 data 引用稳定
    const fixture = { permissions: ["user:read", "user:create"] };
    mockFetcher.mockResolvedValue(fixture);

    const { result, rerender } = renderHook(() => usePermission(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const firstPermissions = result.current.permissions;
    const firstHasPermission = result.current.hasPermission;
    const firstHasAnyPermission = result.current.hasAnyPermission;

    // 触发重渲染（无依赖变化的重新渲染）
    rerender();

    // permissions 数组引用必须保持稳定（同一 useMemo 结果）
    expect(result.current.permissions).toBe(firstPermissions);
    // useCallback 缓存的函数引用也必须保持稳定
    expect(result.current.hasPermission).toBe(firstHasPermission);
    expect(result.current.hasAnyPermission).toBe(firstHasAnyPermission);
  });

  it("首次加载时 isLoading 为 true，完成后为 false", async () => {
    // 让 fetcher 不立即 resolve，确保能观察到 isLoading=true
    let resolveFetch!: (value: { permissions: string[] }) => void;
    mockFetcher.mockReturnValue(
      new Promise<{ permissions: string[] }>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { result } = renderHook(() => usePermission(), {
      wrapper: makeWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveFetch({ permissions: ["user:read"] });
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasPermission("user:read")).toBe(true);
  });
});
