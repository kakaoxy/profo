import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCurrentDate } from "./use-current-date";

describe("useCurrentDate", () => {
  it("客户端环境下返回 Date 对象", () => {
    const { result } = renderHook(() => useCurrentDate());
    expect(result.current).toBeInstanceOf(Date);
  });

  it("返回的日期是有效日期", () => {
    const { result } = renderHook(() => useCurrentDate());
    expect(result.current).not.toBeNull();
    expect(!isNaN(result.current!.getTime())).toBe(true);
  });

  it("多次调用返回同一日期实例（模块级缓存）", () => {
    const { result: r1 } = renderHook(() => useCurrentDate());
    const { result: r2 } = renderHook(() => useCurrentDate());
    expect(r1.current).toBe(r2.current);
  });
});
