/**
 * 报表模块图表工具函数。
 *
 * 该文件为纯函数模块，无运行时副作用，可被 Server/Client Component 共同导入。
 */

/**
 * 计算图表 Y 轴 domain：默认 [min*0.8, max*1.05]；含 0 值或空数组时退化为 [0, max*1.05]。
 *
 * 用于 recharts YAxis 的 `domain` prop，放大连续值变化幅度。
 * 百分比堆叠图（floor/room）不使用此函数，保持 domain=[0, 1]。
 *
 * @param values 数据值数组（可含 null/undefined）
 * @param options.minRatio 最小值缩放比例，默认 0.8
 * @param options.maxRatio 最大值缩放比例，默认 1.05
 * @returns [yMin, yMax] 数组，可直接传给 YAxis domain
 */
export function computeYAxisDomain(
  values: (number | null | undefined)[],
  options?: { minRatio?: number; maxRatio?: number },
): [number, number] {
  const minRatio = options?.minRatio ?? 0.8;
  const maxRatio = options?.maxRatio ?? 1.05;

  const valid = values.filter(
    (v): v is number => typeof v === "number" && !Number.isNaN(v) && Number.isFinite(v),
  );

  if (valid.length === 0) return [0, 1];

  const min = Math.min(...valid);
  const max = Math.max(...valid);

  // 含 0 值或所有值相同时退化为 0 基线，避免视觉误导
  if (min === 0 || min === max) {
    return [0, Math.round(max * maxRatio)];
  }

  return [Math.round(min * minRatio), Math.round(max * maxRatio)];
}
