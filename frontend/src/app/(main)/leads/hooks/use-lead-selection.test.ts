import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLeadSelection } from "./use-lead-selection";
import { Lead, LeadStatus } from "../types";

const createLead = (id: string): Lead => ({
  id,
  communityName: `小区${id}`,
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
});

const sampleLeads = [createLead("1"), createLead("2"), createLead("3")];

describe("useLeadSelection", () => {
  it("初始状态：无选中、抽屉关闭、无编辑、无监控", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    expect(result.current.selectedLeadId).toBeNull();
    expect(result.current.selectedLead).toBeNull();
    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.editingLead).toBeNull();
    expect(result.current.isAddModalOpen).toBe(false);
    expect(result.current.monitoringLead).toBeNull();
  });

  it("传入 initialSelectedLeadId 且线索存在时，自动打开抽屉", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ initialSelectedLeadId: "2", leads: sampleLeads })
    );

    expect(result.current.selectedLeadId).toBe("2");
    expect(result.current.selectedLead).toEqual(sampleLeads[1]);
    expect(result.current.isDrawerOpen).toBe(true);
  });

  it("传入 initialSelectedLeadId 但线索不存在时，不打开抽屉", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ initialSelectedLeadId: "999", leads: sampleLeads })
    );

    expect(result.current.selectedLeadId).toBeNull();
    expect(result.current.isDrawerOpen).toBe(false);
  });

  it("openDetail 打开抽屉并选中线索", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.openDetail("1");
    });

    expect(result.current.selectedLeadId).toBe("1");
    expect(result.current.selectedLead).toEqual(sampleLeads[0]);
    expect(result.current.isDrawerOpen).toBe(true);
  });

  it("closeDetail 关闭抽屉但不取消选中", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.openDetail("1");
    });
    expect(result.current.isDrawerOpen).toBe(true);

    act(() => {
      result.current.closeDetail();
    });

    expect(result.current.isDrawerOpen).toBe(false);
    expect(result.current.selectedLeadId).toBe("1");
  });

  it("startAddLead 打开新增弹窗，editingLead 为 null", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.startAddLead();
    });

    expect(result.current.isAddModalOpen).toBe(true);
    expect(result.current.editingLead).toBeNull();
  });

  it("startEditLead 打开编辑弹窗并设置编辑线索", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.startEditLead(sampleLeads[1]);
    });

    expect(result.current.isAddModalOpen).toBe(true);
    expect(result.current.editingLead).toEqual(sampleLeads[1]);
  });

  it("closeAddModal 关闭弹窗", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.startAddLead();
    });
    expect(result.current.isAddModalOpen).toBe(true);

    act(() => {
      result.current.closeAddModal();
    });

    expect(result.current.isAddModalOpen).toBe(false);
  });

  it("openMonitor 设置监控线索并关闭抽屉", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.openDetail("1");
    });
    expect(result.current.isDrawerOpen).toBe(true);

    act(() => {
      result.current.openMonitor(sampleLeads[0]);
    });

    expect(result.current.monitoringLead).toEqual(sampleLeads[0]);
    expect(result.current.isDrawerOpen).toBe(false);
  });

  it("closeMonitor 清除监控线索", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.openMonitor(sampleLeads[2]);
    });
    expect(result.current.monitoringLead).toEqual(sampleLeads[2]);

    act(() => {
      result.current.closeMonitor();
    });

    expect(result.current.monitoringLead).toBeNull();
  });

  it("selectedLead 随 selectedLeadId 变化而更新", () => {
    const { result } = renderHook(() =>
      useLeadSelection({ leads: sampleLeads })
    );

    act(() => {
      result.current.openDetail("1");
    });
    expect(result.current.selectedLead?.id).toBe("1");

    act(() => {
      result.current.openDetail("3");
    });
    expect(result.current.selectedLead?.id).toBe("3");
  });
});
