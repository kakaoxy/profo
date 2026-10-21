import { describe, expect, it } from "vitest";

import {
  daysSay,
  daysSummary,
  daysTier,
  daysTierLabel,
  daysValueText,
  SCORE_ANCHORS,
  SCORE_LABELS,
  scoreAnchor,
  scoreLabel,
  scoreStars,
  scoreValueText,
} from "./lead-verdict";

/**
 * 评估结论派生函数边界单测（SPEC §4.2 边界表）.
 *
 * 重点覆盖：null / 0 / 负数 / NaN 的降级、档位边界（30|31、60|61、90|91）、
 * 「约 N 个月」的取整规则与整数去小数点。
 */

describe("scoreLabel", () => {
  it.each([
    [1, "难售"],
    [2, "偏弱"],
    [3, "一般"],
    [4, "良好"],
    [5, "优质"],
  ])("%s 分 → %s", (score, expected) => {
    expect(scoreLabel(score)).toBe(expected);
  });

  it.each([[null], [undefined], [0], [6], [-1], [3.5], [NaN]])("%s → null（降级）", (score) => {
    expect(scoreLabel(score as number | null | undefined)).toBeNull();
  });
});

describe("scoreAnchor / SCORE_ANCHORS", () => {
  it("1-5 每档都有锚点，且与常量一致", () => {
    ([1, 2, 3, 4, 5] as const).forEach((s) => {
      expect(scoreAnchor(s)).toBe(SCORE_ANCHORS[s]);
      expect(SCORE_ANCHORS[s].length).toBeGreaterThan(0);
      expect(SCORE_LABELS[s].length).toBeGreaterThan(0);
    });
  });

  it("越界返回 null", () => {
    expect(scoreAnchor(0)).toBeNull();
    expect(scoreAnchor(6)).toBeNull();
    expect(scoreAnchor(null)).toBeNull();
  });
});

describe("daysTier（档位边界）", () => {
  it.each<[number, string]>([
    [1, "rush"],
    [30, "rush"],
    [31, "normal"],
    [45, "normal"],
    [60, "normal"],
    [61, "slowish"],
    [75, "slowish"],
    [90, "slowish"],
    [91, "slow"],
    [110, "slow"],
    [365, "slow"],
  ])("%s 天 → %s", (days, expected) => {
    expect(daysTier(days)).toBe(expected);
  });

  it.each([[null], [undefined], [0], [-1], [NaN]])("%s → null（降级）", (days) => {
    expect(daysTier(days as number | null | undefined)).toBeNull();
  });
});

describe("daysTierLabel", () => {
  it.each<[number, string]>([
    [28, "快"],
    [45, "正常"],
    [75, "偏慢"],
    [130, "慢"],
  ])("%s 天 → %s", (days, expected) => {
    expect(daysTierLabel(days)).toBe(expected);
  });

  it("无效入参返回 null", () => {
    expect(daysTierLabel(null)).toBeNull();
    expect(daysTierLabel(0)).toBeNull();
  });
});

describe("daysSay（约 N 个月）", () => {
  it.each<[number, string]>([
    [1, "约 0 个月"],
    [15, "约 0.5 个月"],
    [30, "约 1 个月"],
    [31, "约 1 个月"],
    [45, "约 1.5 个月"],
    [60, "约 2 个月"],
    [61, "约 2 个月"],
    [90, "约 3 个月"],
    [91, "约 3 个月"],
    [110, "约 3.7 个月"],
    [365, "约 12.2 个月"],
  ])("%s 天 → %s", (days, expected) => {
    expect(daysSay(days)).toBe(expected);
  });

  it("整数月不带小数点（30 → 约 1 个月，非约 1.0 个月）", () => {
    expect(daysSay(30)).not.toContain(".0");
    expect(daysSay(90)).not.toContain(".0");
  });

  it("无效入参返回空串", () => {
    expect(daysSay(null)).toBe("");
    expect(daysSay(0)).toBe("");
    expect(daysSay(NaN)).toBe("");
  });
});

describe("daysSummary（列表卡一行摘要）", () => {
  it.each<[number, string]>([
    [28, "28 天 · 约 0.9 月"],
    [45, "45 天 · 约 1.5 月"],
    [60, "60 天 · 约 2 月"],
    [130, "130 天 · 约 4.3 月"],
  ])("%s 天 → %s", (days, expected) => {
    expect(daysSummary(days)).toBe(expected);
  });

  it("无效入参显式降级为「周期待补」（不留空白）", () => {
    expect(daysSummary(null)).toBe("周期待补");
    expect(daysSummary(0)).toBe("周期待补");
  });
});

describe("scoreValueText / daysValueText（详情双指标文案）", () => {
  it("有值", () => {
    expect(scoreValueText(4)).toBe("4 / 5");
    expect(daysValueText(45)).toBe("45 天");
  });

  it("无值显式降级", () => {
    expect(scoreValueText(null)).toBe("未评分");
    expect(scoreValueText(0)).toBe("未评分");
    expect(daysValueText(null)).toBe("周期待补");
  });
});

describe("scoreStars", () => {
  it("长度恒为 5，前 N 颗实心", () => {
    expect(scoreStars(4)).toEqual([true, true, true, true, false]);
    expect(scoreStars(1)).toEqual([true, false, false, false, false]);
    expect(scoreStars(5)).toEqual([true, true, true, true, true]);
  });

  it("无值全空心", () => {
    expect(scoreStars(null)).toEqual([false, false, false, false, false]);
    expect(scoreStars(6)).toEqual([false, false, false, false, false]);
  });
});
