import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewMode } from "./use-view-mode";

describe("useViewMode", () => {
  it("默认视图模式为 table", () => {
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe("table");
    expect(result.current.isTableView).toBe(true);
    expect(result.current.isGridView).toBe(false);
  });

  it("可指定默认视图模式为 grid", () => {
    const { result } = renderHook(() => useViewMode("grid"));
    expect(result.current.viewMode).toBe("grid");
    expect(result.current.isTableView).toBe(false);
    expect(result.current.isGridView).toBe(true);
  });

  it("setTableView 切换到表格视图", () => {
    const { result } = renderHook(() => useViewMode("grid"));
    expect(result.current.isGridView).toBe(true);

    act(() => {
      result.current.setTableView();
    });

    expect(result.current.viewMode).toBe("table");
    expect(result.current.isTableView).toBe(true);
    expect(result.current.isGridView).toBe(false);
  });

  it("setGridView 切换到网格视图", () => {
    const { result } = renderHook(() => useViewMode());

    act(() => {
      result.current.setGridView();
    });

    expect(result.current.viewMode).toBe("grid");
    expect(result.current.isTableView).toBe(false);
    expect(result.current.isGridView).toBe(true);
  });

  it("setViewMode 直接设置视图模式", () => {
    const { result } = renderHook(() => useViewMode());

    act(() => {
      result.current.setViewMode("grid");
    });

    expect(result.current.viewMode).toBe("grid");
    expect(result.current.isGridView).toBe(true);
  });

  it("多次切换视图模式", () => {
    const { result } = renderHook(() => useViewMode());

    act(() => {
      result.current.setGridView();
    });
    expect(result.current.isGridView).toBe(true);

    act(() => {
      result.current.setTableView();
    });
    expect(result.current.isTableView).toBe(true);

    act(() => {
      result.current.setGridView();
    });
    expect(result.current.isGridView).toBe(true);
  });
});
