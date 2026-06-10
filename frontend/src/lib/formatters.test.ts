import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  safeFormatDate,
  formatPrice,
  formatUnitPrice,
  formatArea,
  formatNumber,
  formatRelativeTime,
  formatFileSize,
} from "./formatters";

// ─── safeFormatDate ────────────────────────────────────────────────
describe("safeFormatDate", () => {
  it("正常格式化日期字符串", () => {
    const result = safeFormatDate("2025-06-01", "yyyy-MM-dd");
    expect(result).toBe("2025-06-01");
  });

  it("使用中文 locale 格式化", () => {
    const result = safeFormatDate("2025-06-01", "yyyy年M月d日");
    expect(result).toBe("2025年6月1日");
  });

  it("null 输入返回 fallback", () => {
    expect(safeFormatDate(null, "yyyy-MM-dd")).toBe("-");
  });

  it("undefined 输入返回 fallback", () => {
    expect(safeFormatDate(undefined, "yyyy-MM-dd")).toBe("-");
  });

  it("空字符串返回 fallback", () => {
    expect(safeFormatDate("", "yyyy-MM-dd")).toBe("-");
  });

  it("无效日期字符串返回 fallback", () => {
    expect(safeFormatDate("not-a-date", "yyyy-MM-dd")).toBe("-");
  });

  it("自定义 fallback 生效", () => {
    expect(safeFormatDate(null, "yyyy-MM-dd", "暂无")).toBe("暂无");
  });

  it("格式化异常时返回 fallback", () => {
    // 传入一个合法日期但非法格式串，date-fns 会抛错
    // 使用 try-catch 分支覆盖
    expect(safeFormatDate("2025-06-01", "", "-")).toBe("-");
  });
});

// ─── formatPrice ───────────────────────────────────────────────────
describe("formatPrice", () => {
  it("正常格式化数字价格", () => {
    expect(formatPrice(1000)).toBe("¥1,000万");
  });

  it("正常格式化字符串价格", () => {
    expect(formatPrice("1000")).toBe("¥1,000万");
  });

  it("小数价格", () => {
    expect(formatPrice(1234.5)).toBe("¥1,234.5万");
  });

  it("0 值返回格式化结果", () => {
    expect(formatPrice(0)).toBe("¥0万");
  });

  it("负数价格", () => {
    expect(formatPrice(-100)).toBe("¥-100万");
  });

  it("undefined 返回 -", () => {
    expect(formatPrice(undefined)).toBe("-");
  });

  it("null 返回 -", () => {
    expect(formatPrice(null)).toBe("-");
  });

  it("NaN 字符串返回 -", () => {
    expect(formatPrice("abc")).toBe("-");
  });
});

// ─── formatUnitPrice ───────────────────────────────────────────────
describe("formatUnitPrice", () => {
  it("正常格式化数字单价", () => {
    expect(formatUnitPrice(3.84)).toBe("¥3.84万/㎡");
  });

  it("正常格式化字符串单价", () => {
    expect(formatUnitPrice("3.84")).toBe("¥3.84万/㎡");
  });

  it("保留两位小数", () => {
    expect(formatUnitPrice(3.8)).toBe("¥3.80万/㎡");
  });

  it("0 值返回 -", () => {
    expect(formatUnitPrice(0)).toBe("-");
  });

  it("字符串 0 返回 -", () => {
    expect(formatUnitPrice("0")).toBe("-");
  });

  it("undefined 返回 -", () => {
    expect(formatUnitPrice(undefined)).toBe("-");
  });

  it("null 返回 -", () => {
    expect(formatUnitPrice(null)).toBe("-");
  });

  it("空字符串返回 -", () => {
    expect(formatUnitPrice("")).toBe("-");
  });

  it("NaN 字符串返回 -", () => {
    expect(formatUnitPrice("abc")).toBe("-");
  });
});

// ─── formatArea ────────────────────────────────────────────────────
describe("formatArea", () => {
  it("正常格式化数字面积", () => {
    expect(formatArea(100)).toBe("100 m²");
  });

  it("正常格式化字符串面积", () => {
    expect(formatArea("100")).toBe("100 m²");
  });

  it("大数字带千分位", () => {
    expect(formatArea(12345)).toBe("12,345 m²");
  });

  it("0 值返回格式化结果", () => {
    expect(formatArea(0)).toBe("0 m²");
  });

  it("undefined 返回 -", () => {
    expect(formatArea(undefined)).toBe("-");
  });

  it("null 返回 -", () => {
    expect(formatArea(null)).toBe("-");
  });

  it("NaN 字符串返回 -", () => {
    expect(formatArea("abc")).toBe("-");
  });
});

// ─── formatNumber ──────────────────────────────────────────────────
describe("formatNumber", () => {
  it("正常格式化数字", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });

  it("带后缀", () => {
    expect(formatNumber(1000, "套")).toBe("1,000套");
  });

  it("字符串数字", () => {
    expect(formatNumber("1000")).toBe("1,000");
  });

  it("0 值", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("负数", () => {
    expect(formatNumber(-500)).toBe("-500");
  });

  it("undefined 返回 -", () => {
    expect(formatNumber(undefined)).toBe("-");
  });

  it("null 返回 -", () => {
    expect(formatNumber(null)).toBe("-");
  });

  it("NaN 字符串返回 -", () => {
    expect(formatNumber("abc")).toBe("-");
  });

  it("默认后缀为空字符串", () => {
    expect(formatNumber(5)).toBe("5");
  });
});

// ─── formatRelativeTime ────────────────────────────────────────────
describe("formatRelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-01T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("短时间差返回不到1分钟前", () => {
    const date = new Date("2025-06-01T11:59:50");
    expect(formatRelativeTime(date)).toContain("分钟");
  });

  it("几分钟前", () => {
    const date = new Date("2025-06-01T11:50:00");
    expect(formatRelativeTime(date)).toContain("分钟");
  });

  it("几小时前", () => {
    const date = new Date("2025-06-01T08:00:00");
    expect(formatRelativeTime(date)).toContain("小时");
  });

  it("几天前", () => {
    const date = new Date("2025-05-29T12:00:00");
    expect(formatRelativeTime(date)).toContain("天");
  });

  it("几个月前", () => {
    const date = new Date("2025-03-01T12:00:00");
    expect(formatRelativeTime(date)).toContain("个月");
  });

  it("几年前", () => {
    const date = new Date("2023-06-01T12:00:00");
    expect(formatRelativeTime(date)).toContain("年");
  });

  it("接受 ISO 字符串输入", () => {
    const result = formatRelativeTime("2025-06-01T11:00:00");
    expect(result).toContain("小时");
  });

  it("接受 Date 对象输入", () => {
    const result = formatRelativeTime(new Date("2025-06-01T11:00:00"));
    expect(result).toContain("小时");
  });
});

// ─── formatFileSize ────────────────────────────────────────────────
describe("formatFileSize", () => {
  it("0 字节返回 '0 B'", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });

  it("字节级别", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("KB 级别", () => {
    expect(formatFileSize(1024)).toBe("1 KB");
  });

  it("MB 级别", () => {
    expect(formatFileSize(1048576)).toBe("1 MB");
  });

  it("GB 级别", () => {
    expect(formatFileSize(1073741824)).toBe("1 GB");
  });

  it("带小数的 MB", () => {
    expect(formatFileSize(1572864)).toBe("1.5 MB");
  });

  it("小于 1KB 的值", () => {
    expect(formatFileSize(500)).toBe("500 B");
  });

  it("负数处理", () => {
    // Math.log 负数返回 NaN，sizes[NaN] 为 undefined
    const result = formatFileSize(-1);
    expect(result).toBe("NaN undefined");
  });
});
