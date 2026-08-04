import type { components } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { formatCurrency, formatNumber } from "./format";

type StageFlow = components["schemas"]["LedgerStatisticsStageFlow"];

interface StageCashflowTimelineProps {
  stageFlows: StageFlow[];
}

/** 阶段现金流量表(收付实现制·现金流视角) */
export function StageCashflowTimeline({
  stageFlows,
}: StageCashflowTimelineProps) {
  const stages = stageFlows;
  const colCount = Math.max(stages.length, 1);

  return (
    <section className="bg-fog py-12">
      <div className="w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <p className="text-xs tracking-[0.2em] text-graphite mb-2">
            PROJECT LIFECYCLE CASHFLOW
          </p>
          <h2 className="text-2xl font-display text-ink flex items-center gap-3">
            全周期阶段现金流量表
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-apricot-wash text-rust text-xs font-medium">
              {colCount} 阶段
            </span>
          </h2>
        </div>

        <div
          className="grid gap-0 relative"
          style={{ gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
        >
          {/* 贯穿连接线：在所有 marker 后方（apricot-wash → rust 渐进） */}
          {colCount > 1 && (
            <div className="hidden md:block absolute top-[14px] left-[8%] right-[8%] h-[2px] z-0 bg-gradient-to-r from-apricot-wash to-rust" />
          )}

          {stages.map((s, i) => {
            const isLast = i === stages.length - 1;
            return (
              <div key={s.stage} className="relative px-3 z-10">
                {/* 阶段 marker */}
                <div className="mb-3 flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-white border-2 border-apricot-wash flex items-center justify-center text-xs text-rust font-semibold shadow-sm">
                    {i + 1}
                  </div>
                  <p className="mt-2 text-sm text-ink font-medium">
                    {s.stage_label}
                  </p>
                </div>

                {/* 阶段卡片 */}
                <div className="bg-white rounded-[14px] p-4 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.05)_0px_4px_12px_-2px]">
                  {s.count === 0 && s.inflow === 0 && s.outflow === 0 ? (
                    <div className="py-6 text-center text-xs text-ash">
                      无现金流
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-graphite">流入</span>
                        <span className="tabular-nums text-money-positive">
                          +{formatCurrency(s.inflow)}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-graphite">流出</span>
                        <span className="tabular-nums text-money-negative">
                          −{formatCurrency(s.outflow)}
                        </span>
                      </div>
                      <div className="border-t border-border/60 pt-2 mt-2 flex items-baseline justify-between gap-2">
                        <span className="text-graphite">阶段净额</span>
                        <span
                          className={cn(
                            "tabular-nums font-medium",
                            (s.net ?? 0) >= 0 ? "text-money-positive" : "text-money-negative",
                          )}
                        >
                          {(s.net ?? 0) >= 0 ? "+" : "−"}
                          {formatCurrency(Math.abs(s.net ?? 0))}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-graphite">流水笔数</span>
                        <span className="tabular-nums text-ink">
                          {formatNumber(s.count)} 笔
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 阶段之间分隔标记(响应式下隐藏连接线时使用) */}
                {!isLast && (
                  <div
                    className="md:hidden h-3"
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* 图例 */}
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-graphite">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-money-positive" />
            流入(收入/配对回退/融资流入)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-money-negative" />
            流出(支出/税费)
          </span>
        </div>

        <div className="mt-4 text-xs text-ash leading-relaxed bg-apricot-wash/30 rounded-xl p-3">
          <strong>💡 数据说明：</strong>
          本看板数据由“交易流水 + 科目字典”的层级映射实时计算得出，
          与权责发生制损益口径一致。切换项目或新增流水后此处会同步刷新。
        </div>
      </div>
    </section>
  );
}
