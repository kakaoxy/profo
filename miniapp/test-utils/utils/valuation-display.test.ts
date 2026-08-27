import { describe, expect, it } from "vitest";
import {
  followupMethodLabel,
  formatDate,
  sliceFollowups,
  statusBadgeStyle,
} from "../../utils/valuation-display";

describe("formatDate", () => {
  it("格式化为 YYYY-MM-DD", () => {
    expect(formatDate("2026-08-09T10:30:00")).toBe("2026-08-09");
  });

  it("withTime=true 时格式化为 YYYY-MM-DD HH:mm", () => {
    expect(formatDate("2026-08-09T10:30:00", true)).toBe("2026-08-09 10:30");
  });

  it("跨天/补零：单数年月日补零", () => {
    expect(formatDate("2026-01-05T08:05:00", true)).toBe("2026-01-05 08:05");
  });

  it("空字符串返回 —", () => {
    expect(formatDate("")).toBe("—");
  });

  it("非法日期返回 —", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("followupMethodLabel", () => {
  it("已知方式映射为中文", () => {
    expect(followupMethodLabel("phone")).toBe("电话");
    expect(followupMethodLabel("wechat")).toBe("微信");
    expect(followupMethodLabel("face")).toBe("面谈");
    expect(followupMethodLabel("visit")).toBe("带看");
  });

  it("未知方式原样返回", () => {
    expect(followupMethodLabel("email")).toBe("email");
  });
});

describe("sliceFollowups", () => {
  const all = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("首页只取前 pageSize 条", () => {
    expect(sliceFollowups(all, 1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("加载更多取后续批次", () => {
    expect(sliceFollowups(all, 2, 5)).toEqual([6, 7, 8, 9, 10]);
  });

  it("末批不足 pageSize 时取剩余", () => {
    expect(sliceFollowups(all, 3, 5)).toEqual([11, 12]);
  });

  it("页码越界返回空数组", () => {
    expect(sliceFollowups(all, 4, 5)).toEqual([]);
  });

  it("空数组返回空数组", () => {
    expect(sliceFollowups([], 1, 5)).toEqual([]);
  });

  it("pageSize < 1 返回空数组", () => {
    expect(sliceFollowups(all, 1, 0)).toEqual([]);
  });

  it("page < 1 返回空数组", () => {
    expect(sliceFollowups(all, 0, 5)).toEqual([]);
  });
});

describe("statusBadgeStyle", () => {
  it("前景用状态色", () => {
    expect(statusBadgeStyle("#ff8c00").color).toBe("#ff8c00");
  });

  it("背景用状态色 + 20% 透明度（#RRGGBB）", () => {
    expect(statusBadgeStyle("#ff8c00").background).toBe("rgba(255, 140, 0, 0.2)");
  });

  it("支持 #RGB 缩写", () => {
    expect(statusBadgeStyle("#f80").background).toBe("rgba(255, 136, 0, 0.2)");
  });

  it("非 hex 色值背景原样返回", () => {
    expect(statusBadgeStyle("red").background).toBe("red");
  });
});
