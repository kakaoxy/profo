import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMounted } from "./use-mounted";

describe("useMounted", () => {
  it("客户端环境下返回 true", () => {
    const { result } = renderHook(() => useMounted());
    expect(result.current).toBe(true);
  });

  it("多次调用结果一致", () => {
    const { result: r1 } = renderHook(() => useMounted());
    const { result: r2 } = renderHook(() => useMounted());
    expect(r1.current).toBe(true);
    expect(r2.current).toBe(true);
  });
});
