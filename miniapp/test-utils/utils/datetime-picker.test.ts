/**
 * 日期时间选择器状态计算：日列必须随年/月联动重建，
 * 否则「打开选择器时所在月份」天数不足时选不到月末
 * （回归：9 月打开选择器 → 切到 8 月 → 日列仍只有 1~30 日，选不到 31 日）.
 */
import { describe, expect, it } from "vitest";
import { buildPickerState, normalizePicker } from "../../pages/viewing/utils/datetime-picker";

/** 取「日」列文案. */
function dayColumn(state: { dtRange: string[][] }): string[] {
  return state.dtRange[2];
}

describe("buildPickerState", () => {
  it("按给定时间构建五列并定位默认选中项", () => {
    const state = buildPickerState(new Date(2026, 8, 20, 10, 30));
    expect(state.dtYearStart).toBe(2025);
    expect(state.dtRange[0]).toEqual(["2025年", "2026年", "2027年"]);
    expect(dayColumn(state)).toHaveLength(30); // 2026-09 共 30 天
    expect(dayColumn(state)[29]).toBe("30日");
    expect(state.dtValue).toEqual([1, 8, 19, 10, 30]);
    expect(state.dtText).toBe("2026-09-20 10:30");
  });

  it("2 月天数按闰年计算", () => {
    expect(dayColumn(buildPickerState(new Date(2028, 1, 10, 8, 0)))).toHaveLength(29);
    expect(dayColumn(buildPickerState(new Date(2027, 1, 10, 8, 0)))).toHaveLength(28);
  });
});

describe("normalizePicker", () => {
  // 打开表单时的状态：今天 2026-09-20（9 月 30 天）
  const base = buildPickerState(new Date(2026, 8, 20, 10, 30));

  it("月列切到 31 天月份后日列补齐到 31 日（回归：8 月选不到 31 号）", () => {
    const picked = [...base.dtValue];
    picked[1] = 7; // 8月
    const next = normalizePicker(base, picked);
    expect(dayColumn(next)).toHaveLength(31);
    expect(dayColumn(next)[30]).toBe("31日");
    expect(next.dtValue).toEqual([1, 7, 19, 10, 30]);
    expect(next.dtText).toBe("2026-08-20 10:30");
  });

  it("31 日选中项切到 30 天月份后夹紧到月末", () => {
    const aug = normalizePicker(base, [1, 7, 30, 9, 5]); // 2026-08-31 09:05
    expect(aug.dtText).toBe("2026-08-31 09:05");

    const picked = [...aug.dtValue];
    picked[1] = 8; // 9月
    const next = normalizePicker(aug, picked);
    expect(dayColumn(next)).toHaveLength(30);
    expect(next.dtValue[2]).toBe(29);
    expect(next.dtText).toBe("2026-09-30 09:05");
  });

  it("31 日选中项切到 2 月后夹紧到 28 日", () => {
    const picked = [1, 1, 30, 9, 5]; // 2月 + 原选中「31日」下标
    const next = normalizePicker(base, picked);
    expect(dayColumn(next)).toHaveLength(28);
    expect(next.dtValue[2]).toBe(27);
    expect(next.dtText).toBe("2026-02-28 09:05");
  });

  it("年列切换同样重建日列", () => {
    const next = normalizePicker(base, [0, 1, 0, 0, 0]); // 2025-02
    expect(next.dtText).toBe("2025-02-01 00:00");
    expect(dayColumn(next)).toHaveLength(28);
  });
});
