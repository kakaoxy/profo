/**
 * 「元 → 万元」聚合金额格式化（DESIGN.md：金额展示统一缩写 ¥xxx.xx万）。
 *
 * ⚠️ 入参单位固定为「元」——后端账本接口（stats / list / 明细聚合）统一以元返回，
 * 本模块负责换算为万元。历史上此处漏除 10000，导致 23000 元被显示成「¥23,000.00万」。
 *
 * ⚠️ 与 `@/lib/formatters` 的 `formatCnyWan` 单位相反：后者入参已是「万元」、只补单位。
 *   本项目 `total_price` / `signed_price` 等房源价格字段本身就以万元计价，不要混用。
 *   为避免同名不同单位，本模块刻意使用单位显式的函数名。
 *
 * 仅用于列表页/明细页的聚合金额（统计卡、项目级收支、净现金流）。
 * 流水明细表保留 formatCNY 的元级精度，避免记账场景丢失分位。
 */

/** 元 → 万元 */
const YUAN_PER_WAN = 10_000;

const wanFormatter = new Intl.NumberFormat("zh-CN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 归一化：null / undefined / NaN 一律按 0 处理（与 statistics/_components/format.ts 的回退语义一致） */
function toSafeNumber(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return value;
}

/**
 * 「¥268.40万」——入参为元；取绝对值，不携带正负号。
 *
 * 用于金额本身已有方向语义的场景（如「流入合计」前缀手写 `+`、表格支出列前缀 `−`）。
 */
export function formatYuanToWan(value: number | null | undefined): string {
  return `¥${wanFormatter.format(Math.abs(toSafeNumber(value)) / YUAN_PER_WAN)}万`;
}

/** 带符号：「+¥927.20万」/「−¥64.60万」——用于净现金流等需要自身表达方向的金额 */
export function formatYuanToWanSigned(value: number | null | undefined): string {
  const num = toSafeNumber(value);
  return `${num >= 0 ? "+" : "−"}${formatYuanToWan(num)}`;
}
