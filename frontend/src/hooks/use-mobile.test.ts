import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./use-mobile";

function createMatchMedia(width: number) {
  return (query: string) => {
    const match = query.match(/\(max-width:\s*(\d+)px\)/);
    const breakpoint = match ? parseInt(match[1]) : 0;
    return {
      matches: width <= breakpoint,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    };
  };
}

describe("useIsMobile", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("窗口宽度 < 768px 时返回 true", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    window.matchMedia = createMatchMedia(500) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("窗口宽度 >= 768px 时返回 false", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    window.matchMedia = createMatchMedia(1024) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("窗口宽度恰好 768px 时返回 false（不视为移动端）", () => {
    Object.defineProperty(window, "innerWidth", { value: 768, configurable: true });
    window.matchMedia = createMatchMedia(768) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("窗口宽度 767px 时返回 true（视为移动端）", () => {
    Object.defineProperty(window, "innerWidth", { value: 767, configurable: true });
    window.matchMedia = createMatchMedia(767) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("响应窗口尺寸变化", () => {
    let changeCallback: (() => void) | null = null;

    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    window.matchMedia = ((query: string) => {
      const match = query.match(/\(max-width:\s*(\d+)px\)/);
      const breakpoint = match ? parseInt(match[1]) : 0;
      return {
        matches: window.innerWidth <= breakpoint,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((_event: string, cb: () => void) => {
          changeCallback = cb;
        }),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
    }) as unknown as typeof window.matchMedia;

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    // 模拟窗口缩小到移动端
    Object.defineProperty(window, "innerWidth", { value: 500, configurable: true });
    act(() => {
      changeCallback?.();
    });

    expect(result.current).toBe(true);
  });
});
