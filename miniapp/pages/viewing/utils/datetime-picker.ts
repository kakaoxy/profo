/**
 * 带看记录新增表单 · 日期时间选择器（年/月/日/时/分五列）.
 *
 * 微信 multiSelector 的列联动必须写在 bindcolumnchange 中：日列随年/月重建，
 * 否则日列会一直沿用「打开选择器时所在月份」的天数，切到更长月份时选不到月末
 * （例：9 月打开选择器，切到 8 月后日列仍只有 1~30 日，选不到 31 日）.
 */
import { pad2 } from "../../../utils/format";

/** 年列跨度（上一年～下一年，共 3 项）. */
const DT_YEAR_SPAN = 1;

/** 月/时/分列文案（固定列）. */
const DT_MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);
const DT_HOURS = Array.from({ length: 24 }, (_, i) => `${pad2(i)}时`);
const DT_MINUTES = Array.from({ length: 60 }, (_, i) => `${pad2(i)}分`);

/** 选择器状态（对应页面 data 的 dtYearStart / dtRange / dtValue / dtText）. */
export interface DateTimePickerState {
  /** 年列起始年（年列 = 起始年起 3 项）. */
  dtYearStart: number;
  /** 五列选项（年/月/日/时/分）. */
  dtRange: string[][];
  /** 五列选中下标. */
  dtValue: number[];
  /** 触发行展示文本（YYYY-MM-DD HH:mm）. */
  dtText: string;
}

/** 选择器状态中参与「日列联动」计算的部分. */
type PickerSlice = Pick<DateTimePickerState, "dtYearStart" | "dtRange" | "dtValue">;

/** 指定年月的天数（month 为 1-based）. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 日列文案（1~count 日）. */
function dayLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${i + 1}日`);
}

/** 触发行文本（YYYY-MM-DD HH:mm）. */
function toText(year: number, value: number[]): string {
  return `${year}-${pad2(value[1] + 1)}-${pad2(value[2] + 1)} ${pad2(value[3])}:${pad2(value[4])}`;
}

/** 按给定时间构建五列选择器状态，并定位默认选中项. */
export function buildPickerState(d: Date): DateTimePickerState {
  const year = d.getFullYear();
  const start = year - DT_YEAR_SPAN;
  const value = [DT_YEAR_SPAN, d.getMonth(), d.getDate() - 1, d.getHours(), d.getMinutes()];
  return {
    dtYearStart: start,
    dtRange: [
      Array.from({ length: DT_YEAR_SPAN * 2 + 1 }, (_, i) => `${start + i}年`),
      DT_MONTHS,
      dayLabels(daysInMonth(year, d.getMonth() + 1)),
      DT_HOURS,
      DT_MINUTES,
    ],
    dtValue: value,
    dtText: toText(year, value),
  };
}

/**
 * 按选中下标归一化状态：重建日列、夹紧越界日、生成展示文本.
 *
 * `bindcolumnchange`（滚动中）与 `bindchange`（点确定）都调用本函数；
 * 前者需先把变化列的选中下标并入 picked 再传入.
 *
 * 返回完整状态（含 dtYearStart），使连续多次调用可直接把上一次结果作为下一次的 state.
 */
export function normalizePicker(state: PickerSlice, picked: number[]): DateTimePickerState {
  const year = state.dtYearStart + picked[0];
  const dim = daysInMonth(year, picked[1] + 1);
  const dtRange = [...state.dtRange];
  dtRange[2] = dayLabels(dim);
  // 原选中日可能超出新月天数（如 8-31 → 9 月），夹紧到月末
  const dtValue = [picked[0], picked[1], Math.min(picked[2], dim - 1), picked[3], picked[4]];
  return { dtYearStart: state.dtYearStart, dtRange, dtValue, dtText: toText(year, dtValue) };
}
