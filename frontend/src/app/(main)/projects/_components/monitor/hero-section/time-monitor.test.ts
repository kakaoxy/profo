import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { calculateTimeMonitor, type TimeMonitor } from "./time-monitor";

describe("calculateTimeMonitor", () => {
  const realDate = Date;

  beforeEach(() => {
    // 固定"今天"为 2026-06-09
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ---------- 1. 正常进度百分比计算 ----------
  it("正常计算进度百分比", () => {
    // 签约日期 2026-01-01，周期 365 天，已过 159 天 → 159/365 ≈ 43.56% → 四舍五入 44%
    const result = calculateTimeMonitor("2026-01-01", 365, 3000);
    expect(result.progress).toBe(44);
  });

  // ---------- 2. 剩余天数计算 ----------
  it("正确计算剩余天数", () => {
    // 周期 200 天，已消耗 159 天 → 剩余 41 天
    const result = calculateTimeMonitor("2026-01-01", 200, 3000);
    expect(result.remaining_days).toBe(41);
  });

  // ---------- 3. 日损失计算（四舍五入） ----------
  it("日损失按月损失除以30并四舍五入", () => {
    // 3000 / 30 = 100
    const result = calculateTimeMonitor("2026-01-01", 365, 3000);
    expect(result.daily_loss).toBe(100);
  });

  it("日损失四舍五入：向下舍入", () => {
    // 2990 / 30 = 99.666... → 100
    const result = calculateTimeMonitor("2026-01-01", 365, 2990);
    expect(result.daily_loss).toBe(100);
  });

  it("日损失四舍五入：向上舍入", () => {
    // 2980 / 30 = 99.333... → 99
    const result = calculateTimeMonitor("2026-01-01", 365, 2980);
    expect(result.daily_loss).toBe(99);
  });

  // ---------- 4. 月损失计算 ----------
  it("月损失等于续租租金", () => {
    const result = calculateTimeMonitor("2026-01-01", 365, 5000);
    expect(result.monthly_loss).toBe(5000);
  });

  // ---------- 5. null/undefined 输入返回默认值 ----------
  it("signingDate 为 null 时返回全零默认值", () => {
    const result = calculateTimeMonitor(null, 365, 3000);
    expect(result).toEqual<TimeMonitor>({
      progress: 0,
      remaining_days: 0,
      daily_loss: 0,
      monthly_loss: 0,
    });
  });

  it("signingPeriod 为 null 时返回全零默认值", () => {
    const result = calculateTimeMonitor("2026-01-01", null, 3000);
    expect(result).toEqual<TimeMonitor>({
      progress: 0,
      remaining_days: 0,
      daily_loss: 0,
      monthly_loss: 0,
    });
  });

  it("signingDate 和 signingPeriod 都为 null 时返回全零默认值", () => {
    const result = calculateTimeMonitor(null, null, 3000);
    expect(result).toEqual<TimeMonitor>({
      progress: 0,
      remaining_days: 0,
      daily_loss: 0,
      monthly_loss: 0,
    });
  });

  it("signingDate 为空字符串时返回全零默认值", () => {
    const result = calculateTimeMonitor("", 365, 3000);
    expect(result).toEqual<TimeMonitor>({
      progress: 0,
      remaining_days: 0,
      daily_loss: 0,
      monthly_loss: 0,
    });
  });

  it("signingPeriod 为 0 时返回全零默认值", () => {
    const result = calculateTimeMonitor("2026-01-01", 0, 3000);
    expect(result).toEqual<TimeMonitor>({
      progress: 0,
      remaining_days: 0,
      daily_loss: 0,
      monthly_loss: 0,
    });
  });

  // ---------- 6. 签约日期在过去 ----------
  it("签约日期在很久以前，进度接近100%", () => {
    // 2020-01-01 签约，周期 365 天，已过 2356 天 → 2356/365 ≈ 645% → clamp 到 100%
    const result = calculateTimeMonitor("2020-01-01", 365, 3000);
    expect(result.progress).toBe(100);
    expect(result.remaining_days).toBe(0);
  });

  // ---------- 7. 进度百分比边界 ----------
  it("进度为 0%（签约日期就是今天）", () => {
    const result = calculateTimeMonitor("2026-06-09", 365, 3000);
    expect(result.progress).toBe(0);
  });

  it("进度为 100%（已消耗天数等于总天数）", () => {
    // 今天 2026-06-09，365 天前是 2025-06-10
    const result = calculateTimeMonitor("2025-06-10", 365, 3000);
    expect(result.progress).toBe(100);
  });

  it("进度超过 100% 时被 clamp 到 100", () => {
    // 2025-01-01 签约，周期 100 天，已过远超 100 天
    const result = calculateTimeMonitor("2025-01-01", 100, 3000);
    expect(result.progress).toBe(100);
  });

  // ---------- 8. 剩余天数非负 ----------
  it("剩余天数不会为负数", () => {
    // 周期 10 天，但签约日期在很久以前
    const result = calculateTimeMonitor("2020-01-01", 10, 3000);
    expect(result.remaining_days).toBe(0);
  });

  it("剩余天数恰好为 0", () => {
    // 今天 2026-06-09，签约日期 2025-06-10，周期 365 天
    // 已消耗 364 天，remaining = 365 - 364 = 1，不是 0
    // 要让 remaining=0，需要 consumedDays >= totalDays
    // 签约日期 2025-06-09，周期 365 天 → consumedDays=365 → remaining=0
    const result = calculateTimeMonitor("2025-06-09", 365, 3000);
    expect(result.remaining_days).toBe(0);
  });

  // ---------- 9. 续租租金为 0 ----------
  it("extensionRent 为 0 时日损失和月损失都为 0", () => {
    const result = calculateTimeMonitor("2026-01-01", 365, 0);
    expect(result.daily_loss).toBe(0);
    expect(result.monthly_loss).toBe(0);
  });

  it("extensionRent 为 null 时日损失和月损失都为 0", () => {
    const result = calculateTimeMonitor("2026-01-01", 365, null);
    expect(result.daily_loss).toBe(0);
    expect(result.monthly_loss).toBe(0);
  });

  // ---------- 额外：进度四舍五入边界 ----------
  it("进度百分比四舍五入：恰好 .5 向上", () => {
    // 需要 consumedDays / totalDays = 0.5 → progress = 50
    // consumedDays = 50, totalDays = 100
    // 签约日期 = 今天 - 50 天 = 2026-04-20
    const result = calculateTimeMonitor("2026-04-20", 100, 3000);
    expect(result.progress).toBe(50);
  });

  it("进度百分比四舍五入：.49 向下", () => {
    // consumedDays / totalDays ≈ 0.4949 → 49.49% → 49
    // consumedDays ≈ 49, totalDays = 100
    // 签约日期 = 今天 - 49 天 = 2026-04-21
    const result = calculateTimeMonitor("2026-04-21", 100, 3000);
    expect(result.progress).toBe(49);
  });
});
