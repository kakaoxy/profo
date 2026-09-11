import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { dedupServerRefresh } from "./refresh-dedup";

describe("dedupServerRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("should call refreshFn once for concurrent calls with the same key", async () => {
    const refreshFn = vi.fn().mockResolvedValue({ accessToken: "a1", refreshToken: "r1" });

    // Fire two concurrent refreshes with the same key
    const p1 = dedupServerRefresh("key-1", refreshFn);
    const p2 = dedupServerRefresh("key-1", refreshFn);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(refreshFn).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ accessToken: "a1", refreshToken: "r1" });
    expect(r2).toEqual({ accessToken: "a1", refreshToken: "r1" });
  });

  it("should call refreshFn separately for different keys", async () => {
    const refreshFn = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "a1", refreshToken: "r1" })
      .mockResolvedValueOnce({ accessToken: "a2", refreshToken: "r2" });

    const p1 = dedupServerRefresh("key-a", refreshFn);
    const p2 = dedupServerRefresh("key-b", refreshFn);

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(refreshFn).toHaveBeenCalledTimes(2);
    expect(r1).toEqual({ accessToken: "a1", refreshToken: "r1" });
    expect(r2).toEqual({ accessToken: "a2", refreshToken: "r2" });
  });

  it("should propagate rejection to all concurrent callers", async () => {
    const refreshFn = vi.fn().mockRejectedValue(new Error("refresh failed"));

    const p1 = dedupServerRefresh("key-fail", refreshFn);
    const p2 = dedupServerRefresh("key-fail", refreshFn);

    await expect(p1).rejects.toThrow("refresh failed");
    await expect(p2).rejects.toThrow("refresh failed");
    expect(refreshFn).toHaveBeenCalledTimes(1);
  });

  it("should allow a new refresh after the cache window expires", async () => {
    const refreshFn = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "a1", refreshToken: "r1" })
      .mockResolvedValueOnce({ accessToken: "a2", refreshToken: "r2" });

    // First call
    const r1 = await dedupServerRefresh("key-reuse", refreshFn);
    expect(r1).toEqual({ accessToken: "a1", refreshToken: "r1" });
    expect(refreshFn).toHaveBeenCalledTimes(1);

    // Advance past the cache window (2s)
    vi.advanceTimersByTime(2100);

    // Second call should invoke refreshFn again
    const r2 = await dedupServerRefresh("key-reuse", refreshFn);
    expect(r2).toEqual({ accessToken: "a2", refreshToken: "r2" });
    expect(refreshFn).toHaveBeenCalledTimes(2);
  });
});
