import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { RefreshResult } from "./refresh-dedup";

describe("refreshTokensDedup", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function loadModule() {
    const mod = await import("./refresh-dedup");
    return mod;
  }

  it("同一 refresh endpoint 的并发请求只调用一次后端 /auth/refresh，所有调用者拿到相同结果", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const p1 = refreshTokensDedup("/api/auth/refresh");
    const p2 = refreshTokensDedup("/api/auth/refresh");
    const p3 = refreshTokensDedup("/api/auth/refresh");

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });

    const expected: RefreshResult = { success: true, retryable: false };
    expect(r1).toEqual(expected);
    expect(r2).toEqual(expected);
    expect(r3).toEqual(expected);
  });

  it("不同 refresh endpoint 的并发请求分别调用后端", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const adminP = refreshTokensDedup("/api/auth/refresh");
    const cP = refreshTokensDedup("/api/auth/c/refresh");

    const [adminR, cR] = await Promise.all([adminP, cP]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(adminR).toEqual({ success: true, retryable: false });
    expect(cR).toEqual({ success: true, retryable: false });
  });

  it("首个刷新返回 401 时，所有并发调用者共享失败结果", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "invalid refresh token" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const p1 = refreshTokensDedup("/api/auth/refresh");
    const p2 = refreshTokensDedup("/api/auth/refresh");
    const p3 = refreshTokensDedup("/api/auth/refresh");

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 401=后端明确拒绝（确定性失效），不可重试
    const expected: RefreshResult = { success: false, retryable: false };
    expect(r1).toEqual(expected);
    expect(r2).toEqual(expected);
    expect(r3).toEqual(expected);
  });

  it("首个刷新返回 403 时，所有并发调用者共享失败结果", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const p1 = refreshTokensDedup("/api/auth/refresh");
    const p2 = refreshTokensDedup("/api/auth/refresh");

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 403 ≠ 401：不证明 refresh_token 失效，按可重试处理
    const expected: RefreshResult = { success: false, retryable: true };
    expect(r1).toEqual(expected);
    expect(r2).toEqual(expected);
  });

  it("mock fetch reject 时不抛未捕获异常，所有并发调用者收到 success=false", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network failure"));

    const p1 = refreshTokensDedup("/api/auth/refresh");
    const p2 = refreshTokensDedup("/api/auth/refresh");

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 网络异常：会话仍可能有效，视作可重试，不触发登出
    const expected: RefreshResult = { success: false, retryable: true };
    expect(r1).toEqual(expected);
    expect(r2).toEqual(expected);
  });

  it("刷新路由返回 503（瞬时失败）时 retryable=true，会话仍有效", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const r = await refreshTokensDedup("/api/auth/refresh");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 503=路由层约定的瞬时失败语义：保留 cookie 可重试，调用方不应登出
    expect(r).toEqual({ success: false, retryable: true });
  });

  it("等待超过 2000ms 后同一 key 可发起新刷新，且 Map 条目已清理", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const r1 = await refreshTokensDedup("/api/auth/refresh");
    expect(r1).toEqual({ success: true, retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2100);

    const r2 = await refreshTokensDedup("/api/auth/refresh");
    expect(r2).toEqual({ success: true, retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("缓存窗口内的后续调用复用已有 Promise，不发起新请求", async () => {
    const { refreshTokensDedup } = await loadModule();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const r1 = await refreshTokensDedup("/api/auth/refresh");

    vi.advanceTimersByTime(500);

    const r2 = await refreshTokensDedup("/api/auth/refresh");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ success: true, retryable: false });
    expect(r2).toEqual({ success: true, retryable: false });
  });
});
