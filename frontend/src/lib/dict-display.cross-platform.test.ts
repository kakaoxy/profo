import { describe, expect, it } from "vitest";

import { previewNormalizedBuildingNo } from "./dict-display";

/**
 * BR-29 跨端一致性测试（前端 ↔ 后端同源口径）.
 *
 * 为什么必须有：归一规则在两侧各实现一份（前端 `lib/dict-display.ts` 用于「将保存为」
 * 预览与展示，后端 `utils/building_dict.py::normalize_building_no` 用于真实落库）。
 * 两份实现一旦漂移，审核员看到的「将保存为 X」与实际写进字典的值就会不一致 ——
 * 这是比规则本身更危险的隐性缺陷（用户按界面预期操作，数据却不同）。
 *
 * 做法：把**同一组样本**在两侧各跑一遍，逐样本断言输出完全相等。
 * 后端侧样本表在 `backend/tests/services/property/test_br29_review_rename.py`
 * 的 `test_normalize_building_no` 参数表中 —— **改一处必须同步另一处**（两处都有
 * 指向对方的注释，任一改动遗漏会在任一侧单测失败）。
 */

/** 与后端 test_normalize_building_no 参数表严格一致的样本（顺序也一致，便于 diff） */
const SHARED_SAMPLES: [string, string][] = [
  ["21号", "21"],
  ["金杨路660弄21号", "金杨路660弄21"],
  // 只剥单个「号」：语义后缀必须原样保留
  ["2号楼", "2号楼"],
  ["单栋", "单栋"],
  ["A栋", "A栋"],
  ["3幢", "3幢"],
  ["5单元", "5单元"],
  // 无后缀原样
  ["21", "21"],
  ["惠园路2000弄01", "惠园路2000弄01"],
  // 回退保护：纯「号」剥完为空 → 保留原文
  ["号", "号"],
  // 空白折叠
  ["  a  b  ", "a b"],
  ["  21号  ", "21"],
  // 空值
  ["", ""],
];

describe("BR-29 跨端一致性：previewNormalizedBuildingNo === 后端 normalize_building_no", () => {
  it.each(SHARED_SAMPLES)("样本 %j → 期望 %j（两侧一致）", (raw, expected) => {
    expect(previewNormalizedBuildingNo(raw)).toBe(expected);
  });

  it("样本表覆盖所有规则分支（防止后续删样本导致口径漏测）", () => {
    const inputs = SHARED_SAMPLES.map(([raw]) => raw);
    // 尾部「号」剥离
    expect(inputs).toContain("21号");
    // 语义后缀保留
    expect(inputs).toContain("2号楼");
    expect(inputs).toContain("单栋");
    // 空结果回退
    expect(inputs).toContain("号");
    // 空白折叠
    expect(inputs.some((s) => s !== s.trim())).toBe(true);
    // 空值
    expect(inputs).toContain("");
  });

  it("两侧都是幂等的（同一样本二次归一结果不变）", () => {
    for (const [raw] of SHARED_SAMPLES) {
      const once = previewNormalizedBuildingNo(raw);
      expect(previewNormalizedBuildingNo(once)).toBe(once);
    }
  });

  it("null / undefined 两侧同口径（都返回空串）", () => {
    expect(previewNormalizedBuildingNo(null)).toBe("");
    expect(previewNormalizedBuildingNo(undefined)).toBe("");
  });

  it("真实脏数据样本不产生空串（历史库里存在这类值）", () => {
    for (const raw of ["号", "号楼", "  号  ", "1-10号", "众旺苑103号"]) {
      expect(previewNormalizedBuildingNo(raw)).not.toBe("");
    }
  });
});
