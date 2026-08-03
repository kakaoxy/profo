import type { components } from "@/lib/api-types";
import { formatCurrency } from "./format";
import { CalcBreakdownDialog } from "./calc-breakdown-dialog";

type FiveLayer = components["schemas"]["LedgerStatisticsFiveLayer"];
type CalcBreakdown = components["schemas"]["LedgerStatisticsCalcBreakdown"];

interface ProfitLadderProps {
  fiveLayer: FiveLayer;
  breakdown: CalcBreakdown;
  businessForm: string | null | undefined;
}

/** 业务模式 → L1 收入层标题/公式 */
function getL1Content(businessForm: string | null | undefined): {
  title: string;
  formula: string;
} {
  if (businessForm === "wholesale") {
    return {
      title: "售房差额",
      formula: "= 卖出价 − (取得成本 + 月供利息)",
    };
  }
  return {
    title: "增值服务费",
    formula: "= 卖出价 − 业主底价",
  };
}

export function ProfitLadder({
  fiveLayer,
  breakdown,
  businessForm,
}: ProfitLadderProps) {
  const l1 = getL1Content(businessForm);
  // 进度条相对值：以 income 为基准 100%，其他按比例
  const maxAbs = Math.max(
    Math.abs(fiveLayer.income),
    Math.abs(fiveLayer.gross),
    Math.abs(fiveLayer.net),
    1,
  );
  const pct = (v: number): string =>
    `${Math.min(100, Math.max(0, (Math.abs(v) / maxAbs) * 100))}%`;

  return (
    <section className="py-12">
      <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <p className="text-xs tracking-[0.2em] text-graphite mb-2">
              PROFIT STRUCTURE
            </p>
            <h2 className="text-2xl font-display text-ink flex items-center gap-3">
              利润三层结构
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-apricot-wash text-rust text-xs font-medium">
                权责发生制
              </span>
            </h2>
          </div>
          <CalcBreakdownDialog breakdown={breakdown}>
            <button
              type="button"
              className="text-sm text-rust hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2 rounded-sm"
            >
              查看计算明细 →
            </button>
          </CalcBreakdownDialog>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <LadderCard
            step={1}
            stepLabel="收入层"
            title={l1.title}
            formula={l1.formula}
            value={fiveLayer.income}
            progress={pct(fiveLayer.income)}
            variant="l1"
          />
          <LadderCard
            step={2}
            stepLabel="毛利层"
            title="收入 − 直接成本"
            formula="= 收入 − (取得成本 + 改造成本 + 佣金)"
            value={fiveLayer.gross}
            progress={pct(fiveLayer.gross)}
            variant="l2"
          />
          <LadderCard
            step={3}
            stepLabel="净利层"
            title="毛利 − 运营费用 − 融资成本"
            formula="= 毛利 − 运营费用 − 项目分润"
            value={fiveLayer.net}
            progress={pct(fiveLayer.net)}
            variant="l3"
          />
        </div>
      </div>
    </section>
  );
}

type LadderVariant = "l1" | "l2" | "l3";

interface LadderCardProps {
  step: number;
  stepLabel: string;
  title: string;
  formula: string;
  value: number;
  progress: string;
  variant: LadderVariant;
}

function LadderCard({
  step,
  stepLabel,
  title,
  formula,
  value,
  progress,
  variant,
}: LadderCardProps) {
  const topBarColor: Record<LadderVariant, string> = {
    l1: "linear-gradient(90deg,#fbe1d1,#f5b896)",
    l2: "linear-gradient(90deg,#f5b896,#d97757)",
    l3: "linear-gradient(90deg,#d97757,#5d2a1a)",
  };
  const progressColor: Record<LadderVariant, string> = {
    l1: "#f5b896",
    l2: "#d97757",
    l3: "#5d2a1a",
  };
  const valueColor = variant === "l3" ? "#5d2a1a" : "#17191c";

  return (
    <div className="relative overflow-hidden bg-white rounded-[18px] p-5 pt-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_8px_16px_-4px]">
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: topBarColor[variant] }}
      />
      <div className="inline-flex items-center gap-1.5 text-xs text-graphite mb-1.5">
        <span
          className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-xs font-semibold"
          style={{
            background:
              "linear-gradient(135deg,#fbe1d1 0%,rgba(251,225,209,.5) 100%)",
            color: "#5d2a1a",
          }}
        >
          {step}
        </span>
        {stepLabel}
      </div>
      <h3 className="text-base text-ink mb-2 font-medium">{title}</h3>
      <p className="text-[11.5px] text-graphite mb-3 leading-[1.7] font-mono">
        {formula}
      </p>
      <p
        className="text-2xl tabular-nums tracking-[-0.3px]"
        style={{ color: valueColor }}
      >
        {formatCurrency(value)}
      </p>
      <div className="mt-3 h-1.5 bg-apricot-wash/30 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: progress, background: progressColor[variant] }}
        />
      </div>
    </div>
  );
}
