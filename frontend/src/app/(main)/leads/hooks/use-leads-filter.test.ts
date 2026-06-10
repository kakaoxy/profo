import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { getFloorCategory, getLayoutRooms, useLeadsFilter } from "./use-leads-filter";
import { Lead, LeadStatus } from "../types";

// mock actions 模块，避免真实网络请求
vi.mock("../actions", () => ({
  getLeadsAction: vi.fn().mockResolvedValue([]),
}));

const createLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: "1",
  communityName: "阳光小区",
  layout: "3室2厅1卫",
  orientation: "南",
  floorInfo: "18/24层",
  area: 100,
  totalPrice: 200,
  unitPrice: 20000,
  status: LeadStatus.PENDING_ASSESSMENT,
  images: [],
  district: "浦东",
  businessArea: "陆家嘴",
  remarks: "",
  creatorName: "张三",
  createdAt: "2024-01-01",
  ...overrides,
});

// ==================== getFloorCategory 纯函数测试 ====================

describe("getFloorCategory", () => {
  it("低楼层：比例 <= 0.33", () => {
    expect(getFloorCategory("1/10层")).toBe("低");
    expect(getFloorCategory("3/10层")).toBe("低");
    expect(getFloorCategory("1/3层")).toBe("中"); // 0.333... > 0.33，属于中楼层
  });

  it("中楼层：0.33 < 比例 <= 0.66", () => {
    expect(getFloorCategory("4/10层")).toBe("中");
    expect(getFloorCategory("5/10层")).toBe("中");
    expect(getFloorCategory("6/10层")).toBe("中");
  });

  it("高楼层：比例 > 0.66", () => {
    expect(getFloorCategory("7/10层")).toBe("高");
    expect(getFloorCategory("8/10层")).toBe("高");
    expect(getFloorCategory("10/10层")).toBe("高");
  });

  it("无法匹配格式时返回'未知'", () => {
    expect(getFloorCategory("")).toBe("未知");
    expect(getFloorCategory("18层")).toBe("未知");
    expect(getFloorCategory("十八层")).toBe("未知");
    expect(getFloorCategory("abc")).toBe("未知");
    expect(getFloorCategory("低楼层")).toBe("未知");
  });
});

// ==================== getLayoutRooms 纯函数测试 ====================

describe("getLayoutRooms", () => {
  it("1室户型返回'1'", () => {
    expect(getLayoutRooms("1室0厅1卫")).toBe("1");
  });

  it("2室户型返回'2'", () => {
    expect(getLayoutRooms("2室1厅1卫")).toBe("2");
  });

  it("3室户型返回'3'", () => {
    expect(getLayoutRooms("3室2厅1卫")).toBe("3");
  });

  it("4室户型返回'4'", () => {
    expect(getLayoutRooms("4室2厅2卫")).toBe("4");
  });

  it("5室及以上返回'4+'", () => {
    expect(getLayoutRooms("5室2厅2卫")).toBe("4+");
    expect(getLayoutRooms("6室3厅3卫")).toBe("4+");
  });

  it("无法匹配格式时返回'其他'", () => {
    expect(getLayoutRooms("")).toBe("其他");
    expect(getLayoutRooms("别墅")).toBe("其他");
    expect(getLayoutRooms("abc")).toBe("其他");
    expect(getLayoutRooms("一室一厅")).toBe("其他");
  });
});

// ==================== useLeadsFilter Hook 测试 ====================

describe("useLeadsFilter", () => {
  const sampleLeads = [
    createLead({ id: "1", communityName: "阳光小区", status: LeadStatus.PENDING_ASSESSMENT, floorInfo: "2/10层", layout: "3室2厅1卫" }),
    createLead({ id: "2", communityName: "月光花园", status: LeadStatus.PENDING_VISIT, floorInfo: "8/10层", layout: "2室1厅1卫" }),
    createLead({ id: "3", communityName: "星光大厦", status: LeadStatus.REJECTED, floorInfo: "5/10层", layout: "1室0厅1卫" }),
  ];

  it("初始状态：返回所有线索和默认过滤条件", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    expect(result.current.leads).toEqual(sampleLeads);
    expect(result.current.filters).toEqual({
      search: "",
      statuses: [],
      district: "",
      creator: "",
      layouts: [],
      floors: [],
    });
    expect(result.current.activeTab).toBe("all");
    expect(result.current.searchQuery).toBe("");
    expect(result.current.filteredLeads).toEqual(sampleLeads);
  });

  it("搜索过滤：按小区名称过滤", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setSearchQuery("阳光");
    });

    expect(result.current.filteredLeads.length).toBe(1);
    expect(result.current.filteredLeads[0].communityName).toBe("阳光小区");
  });

  it("搜索过滤：按区域过滤", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setSearchQuery("浦东");
    });

    // 所有 lead 的 district 都是 "浦东"
    expect(result.current.filteredLeads.length).toBe(3);
  });

  it("搜索过滤：无匹配结果返回空数组", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setSearchQuery("不存在的名称");
    });

    expect(result.current.filteredLeads).toEqual([]);
  });

  it("状态过滤：按单个状态过滤", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setActiveTab(LeadStatus.PENDING_VISIT);
    });

    expect(result.current.filteredLeads.length).toBe(1);
    expect(result.current.filteredLeads[0].id).toBe("2");
    expect(result.current.activeTab).toBe(LeadStatus.PENDING_VISIT);
  });

  it("状态过滤：'all' 显示全部", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setActiveTab(LeadStatus.PENDING_VISIT);
    });
    expect(result.current.filteredLeads.length).toBe(1);

    act(() => {
      result.current.setActiveTab("all");
    });
    expect(result.current.filteredLeads.length).toBe(3);
  });

  it("楼层过滤：按楼层分类过滤", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        floors: ["低"],
      }));
    });

    expect(result.current.filteredLeads.length).toBe(1);
    expect(result.current.filteredLeads[0].id).toBe("1");
  });

  it("户型过滤：按户型分类过滤", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setFilters((prev) => ({
        ...prev,
        layouts: ["2"],
      }));
    });

    expect(result.current.filteredLeads.length).toBe(1);
    expect(result.current.filteredLeads[0].id).toBe("2");
  });

  it("重置过滤：恢复初始状态", () => {
    const { result } = renderHook(() => useLeadsFilter(sampleLeads));

    act(() => {
      result.current.setSearchQuery("阳光");
    });
    expect(result.current.filteredLeads.length).toBe(1);

    act(() => {
      result.current.resetFilters();
    });

    expect(result.current.filters.search).toBe("");
    expect(result.current.filters.statuses).toEqual([]);
    expect(result.current.activeTab).toBe("all");
    expect(result.current.searchQuery).toBe("");
  });
});
