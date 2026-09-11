// @vitest-environment node
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth/client/refresh-dedup", () => ({
  refreshTokensDedup: vi.fn().mockResolvedValue({
    success: true,
    accessToken: "new-token",
  }),
}));

vi.mock("@/lib/config", () => ({
  getClientApiUrl: vi.fn(() => "https://example.com"),
}));

describe("cClient 401 刷新重试", () => {
  let setTimeoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("401 后刷新成功重试时不应通过 setTimeout 延迟 100ms", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response('{"result":"ok"}', { status: 200 }));

    const { cClient } = await import("./client");

    const requestPromise = cClient.GET("/some-path" as never);
    await vi.advanceTimersByTimeAsync(200);

    const { response } = await requestPromise;

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // 100ms 延迟应已删除：不应存在延迟为 100 的 setTimeout 调用
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 100);
  });
});
