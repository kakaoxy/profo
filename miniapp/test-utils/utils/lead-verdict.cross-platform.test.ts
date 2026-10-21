import { describe, expect, it } from "vitest";

import { daysSay, daysSummary, daysTier, daysTierLabel, scoreAnchor, scoreLabel } from "../../utils/lead-verdict";

/**
 * 评估结论派生函数**跨端一致性**测试（小程序侧）.
 *
 * 与 `frontend/src/lib/lead-verdict.cross-platform.test.ts` 使用**同一组样本**，
 * 重点断言两端输出相同。样本表改动必须两侧同步（两处文件互相指向）。
 */

/** 天数样本 —— 与前端侧严格一致，顺序也一致便于 diff */
export const SHARED_DAY_SAMPLES: readonly number[] = [
  1, 7, 15, 28, 29, 30, 31, 45, 59, 60, 61, 75, 89, 90, 91, 110, 130, 180, 365,
];

/** 无效天数样本 */
export const SHARED_INVALID_DAY_SAMPLES: readonly (number | null)[] = [null, 0, -1, Number.NaN];

/** 评分样本 */
export const SHARED_SCORE_SAMPLES: readonly (number | null)[] = [1, 2, 3, 4, 5, null, 0, 6, 3.5];

describe("跨端一致性：天数档位 / 文案 / 摘要", () => {
  it.each(SHARED_DAY_SAMPLES)("样本 %s 天：各派生值均非空", (days) => {
    expect(daysTier(days)).not.toBeNull();
    expect(daysTierLabel(days)).not.toBeNull();
    expect(daysSay(days)).not.toBe("");
    expect(daysSummary(days)).not.toBe("周期待补");
    expect(daysSummary(days)).toContain(`${days} 天`);
    expect(daysSummary(days)).toContain("约");
  });

  it.each(SHARED_INVALID_DAY_SAMPLES)("无效样本 %s → 统一降级", (days) => {
    expect(daysTier(days)).toBeNull();
    expect(daysTierLabel(days)).toBeNull();
    expect(daysSay(days)).toBe("");
    expect(daysSummary(days)).toBe("周期待补");
  });

  it("档位分界点语义固定（跨端契约）", () => {
    expect(daysTier(30)).toBe("rush");
    expect(daysTier(31)).toBe("normal");
    expect(daysTier(60)).toBe("normal");
    expect(daysTier(61)).toBe("slowish");
    expect(daysTier(90)).toBe("slowish");
    expect(daysTier(91)).toBe("slow");
  });
});

describe("跨端一致性：评分标签与锚点", () => {
  it.each(SHARED_SCORE_SAMPLES)("样本 %s：label 与 anchor 同生同灭", (score) => {
    expect(scoreLabel(score) === null).toBe(scoreAnchor(score) === null);
  });

  it("1-5 分标签固定", () => {
    expect([1, 2, 3, 4, 5].map((s) => scoreLabel(s))).toEqual(["难售", "偏弱", "一般", "良好", "优质"]);
  });
});

describe("跨端一致性：不变量", () => {
  it("daysSay 与 daysSummary 里的月份数字一致", () => {
    for (const days of SHARED_DAY_SAMPLES) {
      const say = daysSay(days);
      const summary = daysSummary(days);
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
