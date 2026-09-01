import type { components } from "@/lib/api-types";

type TrendPoint = components["schemas"]["TrendPoint"];

/** SVG 画布与绘图区常量（对齐设计稿 viewBox 0 0 660 240） */
const VIEW_W = 660;
const VIEW_H = 240;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 640;
const PLOT_BOTTOM = 210;
const PLOT_TOP = 30;

/**
 * 近 30 天线索趋势折线图（纯 SVG，无第三方图表库）。
 *
 * 对齐设计稿样式：横向网格线 + 渐变面积 + 折线 + 末点数值标注 + 首中尾日期刻度。
 * 纵轴量程按数据最大值取整到 3 的整数倍步长（如 0-30，每 10 一档）。
 */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const counts = points.map((p) => p.count);
  const n = points.length;

  if (n < 2) {
    return <div className="py-16 text-center text-[13px] text-slate">暂无趋势数据</div>;
  }

  const rawMax = Math.max(...counts, 1);
  const step = Math.ceil(rawMax / 3);
  const top = step * 3;

  const xAt = (i: number) => PLOT_LEFT + ((PLOT_RIGHT - PLOT_LEFT) * i) / (n - 1);
  const yAt = (v: number) => PLOT_BOTTOM - (PLOT_BOTTOM - PLOT_TOP) * (v / top);

  const coords = counts.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
  const areaPath = [
    `M${PLOT_LEFT},${PLOT_BOTTOM}`,
    ...coords.map((c) => `L${c.x},${c.y}`),
    `L${xAt(n - 1)},${PLOT_BOTTOM}`,
    "Z",
  ].join(" ");

  // 纵轴刻度：0 / step / 2step / 3step
  const yTicks = [0, step, step * 2, step * 3];

  // 横轴日期刻度：首 / 1/4 / 1/2 / 3/4 / 末（去重后保序）
  const quarterIndices = [
    0,
    Math.round((n - 1) / 4),
    Math.round((n - 1) / 2),
    Math.round(((n - 1) * 3) / 4),
    n - 1,
  ];
  const xTicks = [...new Set(quarterIndices)];

  const last = coords[n - 1];
  const lastValue = counts[n - 1];

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="w-full h-auto block"
      role="img"
      aria-label="近 30 天线索趋势折线图"
    >
      <defs>
        <linearGradient id="growth-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d2a1a" stopOpacity=".16" />
          <stop offset="1" stopColor="#5d2a1a" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* 网格线 */}
      <g stroke="#eef0f3" strokeWidth="1">
        {yTicks.map((t) => (
          <line key={t} x1={PLOT_LEFT} y1={yAt(t)} x2={PLOT_RIGHT} y2={yAt(t)} />
        ))}
      </g>

      {/* 纵轴刻度值 */}
      <g fill="#8b8c8d" fontSize="11" textAnchor="end">
        {yTicks.map((t) => (
          <text key={t} x={PLOT_LEFT - 10} y={yAt(t) + 4}>
            {t}
          </text>
        ))}
      </g>

      {/* 渐变面积 + 折线 */}
      <path d={areaPath} fill="url(#growth-trend-fill)" />
      <polyline
        fill="none"
        stroke="#5d2a1a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={linePoints}
      />

      {/* 末点标注 */}
      <circle cx={last.x} cy={last.y} r="3.5" fill="#5d2a1a" />
      <text
        x={last.x}
        y={Math.max(last.y - 14, PLOT_TOP)}
        fill="#5d2a1a"
        fontSize="11"
        textAnchor="middle"
        fontWeight="600"
      >
        {lastValue}
      </text>

      {/* 横轴日期刻度（MM-DD） */}
      <g fill="#8b8c8d" fontSize="11" textAnchor="middle">
        {xTicks.map((i) => (
          <text key={i} x={xAt(i)} y={232}>
            {points[i].date.slice(5)}
          </text>
        ))}
      </g>
    </svg>
  );
}
