import { describe, expect, it } from "vitest";

import * as FE from "./lead-verdict";
import * as MP from "../../../miniapp/utils/lead-verdict";

/**
 * 跨端**硬**一致性测试：直接 import 两个真实实现并逐字比对输出.
 *
 * 与两份 `*.cross-platform.test.ts` 的区别：那两个测的是「各自侧样本表内不变式」，
 * 本文件测的是「两个实现之间输出完全相同」—— 只有当两侧代码真正同值时才会通过，
 * 任一侧改了阈值/文案而另一侧没跟上，这里立刻红。
 *
 * 样本覆盖：全部档位边界（30|31、60|61、90|91）、典型值、以及全部降级入参。
 */

const DAY_SAMPLES: (number | null)[] = [
  1,
  7,
  15,
  28,
  29,
  30,
  31,
  45,
  59,
  60,
  61,
  75,
  89,
  90,
  91,
  110,
  130,
  180,
  365,
  null,
  0,
  -1,
  Number.NaN,
];

const SCORE_SAMPLES: (number | null)[] = [1, 2, 3, 4, 5, null, 0, 6, 3.5];

describe("跨端硬一致性：前端 lead-verdict ≡ 小程序 lead-verdict", () => {
  it("天数派生全字段逐字相同", () => {
    const project = (M: typeof FE) =>
      DAY_SAMPLES.map((d) => [
        M.daysTier(d),
        M.daysTierLabel(d),
        M.daysSay(d),
        M.daysSummary(d),
        M.daysValueText(d),
      ]);
    expect(project(MP as unknown as typeof FE)).toEqual(project(FE));
  });

  it("评分派生全字段逐字相同", () => {
    const project = (M: typeof FE) =>
      SCORE_SAMPLES.map((s) => [
        M.scoreLabel(s),
        M.scoreAnchor(s),
        M.scoreStars(s),
        M.scoreValueText(s),
      ]);
    expect(project(MP as unknown as typeof FE)).toEqual(project(FE));
  });

  it("常量表同值（标签 / 锚点 / 档位词）", () => {
    expect(MP.SCORE_LABELS).toEqual(FE.SCORE_LABELS);
    expect(MP.SCORE_ANCHORS).toEqual(FE.SCORE_ANCHORS);
    expect(MP.TIER_LABELS).toEqual(FE.TIER_LABELS);
  });
});
