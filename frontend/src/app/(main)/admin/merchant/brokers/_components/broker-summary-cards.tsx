import type { components } from "@/lib/api-types";

type BrokerSummary = components["schemas"]["BrokerSummaryResponse"];

/** 经纪人概览 KPI 四卡（REQ-IT7-04：总数 / 已绑定 / 未绑定 / 待审核绑定）.*/
export function BrokerSummaryCards({ summary }: { summary: BrokerSummary | null }) {
  const cards = [
    { label: "经纪人总数", value: summary?.total ?? 0, sub: "全部在库档案", tone: "bg-white" },
    {
      label: "已绑定门店",
      value: summary?.bound ?? 0,
      sub: summary?.total ? `覆盖率 ${((summary.bound / summary.total) * 100).toFixed(1)}%` : "—",
      tone: "bg-apricot-wash",
    },
    { label: "未绑定", value: summary?.unbound ?? 0, sub: "可直接分配门店", tone: "bg-sky-wash" },
    {
      label: "待审核绑定",
      value: summary?.pending_binding_count ?? 0,
      sub: (summary?.pending_binding_count ?? 0) > 0 ? "需要今日处理" : "暂无待处理",
      tone: "bg-white",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-cards px-5 py-4 shadow-steep-sm ${card.tone}`}>
          <p className="text-xs text-graphite">{card.label}</p>
          <p className="mt-2 font-display text-[32px] leading-none tracking-tight text-ink tabular-nums">{card.value}</p>
          <p className="mt-2 text-[11px] text-graphite">{card.sub}</p>
        </div>
      ))}
    </div>
  );
}
