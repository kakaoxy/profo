import Link from "next/link";
import { Plus } from "lucide-react";
import type { FunnelData } from "../types";
import { formatConversionRate } from "@/lib/formatters";

interface LeadsFunnelCardProps {
  funnelData: FunnelData;
}

/**
 * 工作台「线索漏斗」卡（Steep，设计稿决策 09）：
 * 横向胶囊漏斗条，色彩阶梯 Ink → #4a90e2 蓝 → Apricot → Rust；
 * 底部为整屏唯一 Ink 填充主按钮「新增线索」。
 */
export function LeadsFunnelCard({ funnelData }: LeadsFunnelCardProps) {
  const { total, evaluating, visiting, signed } = funnelData;

  const stages = [
    { key: "total", label: "总线索", value: total, color: "var(--color-ink)" },
    { key: "evaluating", label: "进入评估", value: evaluating, color: "#4a90e2" },
    {
      key: "visiting",
      label: "实地看房",
      value: visiting,
      color: "var(--color-apricot-wash)",
      border: "#f2d0ba",
    },
    { key: "signed", label: "签约", value: signed, color: "var(--color-rust)" },
  ];

  const getPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);
  const conversionRate = formatConversionRate(total, signed);

  return (
    <div
      className="col-span-12 lg:col-span-4 bg-white rounded-cards shadow-steep-sm px-6 py-[22px] flex flex-col min-w-0"
      role="region"
      aria-label="线索漏斗转化"
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-ink">线索漏斗</span>
        <span className="text-[12.5px] text-graphite">本月</span>
      </div>

      <div
        className="flex-1 flex flex-col justify-center gap-[11px] mt-[18px] mb-[14px] min-w-0"
        role="list"
        aria-label="各阶段线索数量"
      >
        {stages.map((stage) => (
          <div key={stage.key} className="flex items-center gap-3 min-w-0" role="listitem">
            <span className="w-[58px] shrink-0 text-right text-[12.5px] text-graphite">
              {stage.label}
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-fog overflow-hidden min-w-0">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${getPercent(stage.value)}%`,
                  minWidth: stage.value > 0 ? "8px" : 0,
                  background: stage.color,
                  boxShadow: stage.border ? `inset 0 0 0 1px ${stage.border}` : undefined,
                }}
              />
            </span>
            <span className="w-[34px] shrink-0 text-[13.5px] font-[480] tabular-nums text-ink">
              {stage.value}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 pt-2">
        <span className="text-[13px] text-graphite min-w-0">
          总线索 <b className="font-[480] text-ink tabular-nums">{total}</b>
          <span className="mx-[7px] text-dove" aria-hidden="true">
            ·
          </span>
          转化率 <b className="font-[480] text-ink tabular-nums">{conversionRate}</b>
        </span>
        <Link
          href="/admin/leads/new"
          className="inline-flex shrink-0 items-center gap-[6px] rounded-full bg-ink px-4 py-[7px] text-[13px] font-[450] text-white shadow-[0_6px_16px_-6px_rgba(23,25,28,0.4)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          新增线索
        </Link>
      </div>
    </div>
  );
}
