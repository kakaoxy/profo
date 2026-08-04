import type { components } from "@/lib/api-types";
import { cn } from "@/lib/utils";
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
  // F1: LedgerStatisticsFiveLayer 字段均为 optional，解构时给默认值 0 避免透传 undefined
  const { income = 0, gross = 0, net = 0 } = fiveLayer;
  // 进度条相对值：以 income 为基准 100%，其他按比例
  const maxAbs = Math.max(
    Math.abs(income),
    Math.abs(gross),
    Math.abs(net),
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
            value={income}
            progress={pct(income)}
            variant="l1"
          />
          <LadderCard
            step={2}
            stepLabel="毛利层"
            title="收入 − 直接成本"
            formula="= 收入 − (取得成本 + 改造成本 + 佣金)"
            value={gross}
            progress={pct(gross)}
            variant="l2"
          />
          <LadderCard
            step={3}
            stepLabel="净利层"
            title="毛利 − 运营费用 − 融资成本"
            formula="= 毛利 − 运营费用 − 项目分润"
            value={net}
            progress={pct(net)}
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
  // 暖色三层渐进：apricot-wash → rust，中间档用 rust 的不透明度近似原 #f5b896/#d97757
  const topBarClass: Record<LadderVariant, string> = {
    l1: "bg-gradient-to-r from-apricot-wash to-rust/30",
    l2: "bg-gradient-to-r from-rust/30 to-rust/60",
    l3: "bg-gradient-to-r from-rust/60 to-rust",
  };
  const progressClass: Record<LadderVariant, string> = {
    l1: "bg-rust/30",
    l2: "bg-rust/60",
    l3: "bg-rust",
  };
  const valueColorClass = variant === "l3" ? "text-rust" : "text-ink";

  return (
    <div className="relative overflow-hidden bg-white rounded-[18px] p-5 pt-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_8px_16px_-4px]">
      <div
        className={cn(
          "absolute top-0 left-0 right-0 h-1",
          topBarClass[variant],
        )}
      />
      <div className="inline-flex items-center gap-1.5 text-xs text-graphite mb-1.5">
        <span
          className={cn(
            "inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-xs font-semibold",
            "bg-gradient-to-br from-apricot-wash to-apricot-wash/50 text-rust",
          )}
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
        className={cn(
          "text-2xl tabular-nums tracking-[-0.3px]",
          valueColorClass,
        )}
      >
        {formatCurrency(value)}
      </p>
      <div className="mt-3 h-1.5 bg-apricot-wash/30 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            progressClass[variant],
          )}
          style={{ width: progress }}
        />
      </div>
    </div>
  );
}
