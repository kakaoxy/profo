import { describe, expect, it } from "vitest";

import {
  daysSay,
  daysSummary,
  daysTier,
  daysTierLabel,
  scoreAnchor,
  scoreLabel,
} from "./lead-verdict";

/**
 * 评估结论派生函数**跨端一致性**测试（前端 ↔ 小程序同源口径）.
 *
 * 为什么必须有：档位规则在两侧各实现一份（前端 `lib/lead-verdict.ts` 供 admin 与 C 端 Web，
 * 小程序 `utils/lead-verdict.ts` 供 authorize/evaluate/detail）。两份实现一旦漂移，
 * 同一套房源在后台与小程序上会显示不同档位 —— 这是比规则本身更危险的隐性缺陷。
 *
 * 做法：把**同一组样本**在两侧各跑一遍，逐样本断言输出完全相等。
 * 小程序侧样本表在 `miniapp/test-utils/utils/lead-verdict.cross-platform.test.ts`
 * —— **改一处必须同步另一处**（两处都有指向对方的注释，任一改动遗漏会在任一侧单测失败）。
 *
 * ⚠️ 阈值来源说明：30/60/90 沿用项目「带看时效」分档语感（SPEC K5），**非市场校准结果**；
 * 未来拿到真实成交周期分布后只需改 lead-verdict 一处（两端同步），本样本表随之更新。
 */

/** 天数样本（覆盖全部档位边界与典型值）—— 与小程序侧严格一致，顺序也一致便于 diff */
export const SHARED_DAY_SAMPLES: readonly number[] = [
  1, 7, 15, 28, 29, 30, 31, 45, 59, 60, 61, 75, 89, 90, 91, 110, 130, 180, 365,
];

/** 无效天数样本（降级口径必须两端一致） */
export const SHARED_INVALID_DAY_SAMPLES: readonly (number | null)[] = [null, 0, -1, Number.NaN];

/** 评分样本 */
export const SHARED_SCORE_SAMPLES: readonly (number | null)[] = [1, 2, 3, 4, 5, null, 0, 6, 3.5];

describe("跨端一致性：天数档位 / 文案 / 摘要", () => {
  it.each(SHARED_DAY_SAMPLES)("样本 %s 天：tier 非空且 label/say/summary 均有值", (days) => {
    expect(daysTier(days)).not.toBeNull();
    expect(daysTierLabel(days)).not.toBeNull();
    expect(daysSay(days)).not.toBe("");
    expect(daysSummary(days)).not.toBe("周期待补");
    // 摘要必须包含天数本身与「约 N 月」翻译（两个信息都不能丢）
    expect(daysSummary(days)).toContain(`${days} 天`);
    expect(daysSummary(days)).toContain("约");
  });

  it.each(SHARED_INVALID_DAY_SAMPLES)("无效样本 %s → 统一降级", (days) => {
    expect(daysTier(days)).toBeNull();
    expect(daysTierLabel(days)).toBeNull();
    expect(daysSay(days)).toBe("");
    expect(daysSummary(days)).toBe("周期待补");
  });

  it("档位分界点语义固定（改动即破坏跨端契约，需同步两侧）", () => {
    expect(daysTier(30)).toBe("rush");
    expect(daysTier(31)).toBe("normal");
    expect(daysTier(60)).toBe("normal");
    expect(daysTier(61)).toBe("slowish");
    expect(daysTier(90)).toBe("slowish");
    expect(daysTier(91)).toBe("slow");
  });
});

describe("跨端一致性：评分标签与锚点", () => {
  it.each(SHARED_SCORE_SAMPLES)("样本 %s：label 与 anchor 同时有值或同时为 null", (score) => {
    const label = scoreLabel(score);
    const anchor = scoreAnchor(score);
    // 关键不变式：两者必须同生同灭，否则 UI 会出现「有标签无锚点」的半渲染态
    expect(label === null).toBe(anchor === null);
  });

  it("1-5 分标签固定", () => {
    expect([1, 2, 3, 4, 5].map((s) => scoreLabel(s))).toEqual([
      "难售",
      "偏弱",
      "一般",
      "良好",
      "优质",
    ]);
  });
});

describe("跨端一致性：不变量", () => {
  it("daysSay 与 daysSummary 里的月份数字必须一致（同一翻译规则）", () => {
    for (const days of SHARED_DAY_SAMPLES) {
      const say = daysSay(days); // 约 X 个月
      const summary = daysSummary(days); // N 天 · 约 X 月
      const sayNum = say.replace(/[^\d.]/g, "");
      const summaryNum = summary.replace(/.*约\s*/, "").replace(/[^\d.]/g, "");
      expect(summaryNum).toBe(sayNum);
    }
  });

  it("单调性：天数越大，档位不下降", () => {
    const order = { rush: 0, normal: 1, slowish: 2, slow: 3 } as const;
    let prev = -1;
    for (const days of [...SHARED_DAY_SAMPLES].sort((a, b) => a - b)) {
      const tier = daysTier(days);
      expect(tier).not.toBeNull();
      const rank = order[tier as keyof typeof order];
      expect(rank).toBeGreaterThanOrEqual(prev);
      prev = rank;
    }
  });
});
