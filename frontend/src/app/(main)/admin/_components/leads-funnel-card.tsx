import type { FunnelData } from "../types";
import { WidgetHead } from "./widgets/widget-head";

interface LeadsFunnelCardProps {
  funnelData: FunnelData;
}

/**
 * 工作台「线索漏斗」卡（span 3，设计稿屏 01 第 2 卡）。
 *
 * hifi `.funnel` + `.f-row`：4 行「标签 / 胶囊条 / 数值」，色彩阶梯
 * Ink → #4a90e2 → Sky Wash → Rust（原第 3 档用 Apricot，与暖卡抢唯一的
 * 暖色语义，按设计稿改 Sky）。
 * 卡头链接「线索」；原底部「总线索/转化率 + 新增线索」页脚为设计稿没有的
 * 自造元素，按「严格对齐设计稿」口径移除（新增入口保留在 /admin/leads/new）。
 */
export function LeadsFunnelCard({ funnelData }: LeadsFunnelCardProps) {
  const { total, evaluating, visiting, signed } = funnelData;

  const stages = [
    { key: "total", label: "总线索", value: total, color: "var(--color-ink)" },
    { key: "evaluating", label: "进入评估", value: evaluating, color: "#4a90e2" },
    { key: "visiting", label: "实地看房", value: visiting, color: "var(--color-sky-wash)" },
    { key: "signed", label: "签约", value: signed, color: "var(--color-rust)" },
  ];

  const getPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="线索漏斗"
    >
      <WidgetHead title="线索漏斗" sub="本月" link="线索" href="/admin/leads" />

      <div className="mt-4 flex flex-col gap-[11px]" role="list" aria-label="各阶段线索数量">
        {stages.map((stage) => (
          <div key={stage.key} className="flex min-w-0 items-center gap-2.5" role="listitem">
            <span className="w-14 shrink-0 text-right text-[12.5px] text-graphite">
              {stage.label}
            </span>
            <span className="h-[9px] min-w-0 flex-1 overflow-hidden rounded-full bg-fog">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${getPercent(stage.value)}%`,
                  minWidth: stage.value > 0 ? "8px" : 0,
                  background: stage.color,
                }}
              />
            </span>
            <span className="w-[30px] shrink-0 text-right text-[13px] font-[480] tabular-nums text-ink">
              {stage.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
