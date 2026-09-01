"use client";

import type { GrowthEmployeeDrilldownData } from "../../_lib/funnel-data";
import { GROWTH_MODULE_META, RECRUIT_BADGE_CLASS } from "../../types";
import { DesignPagination } from "@/app/(main)/admin/growth-center/_components/design-pagination";

interface FunnelDrilldownProps {
  /** 员工维度下钻数据（含未归因聚合行，各行合计与该模块漏斗一致） */
  data: GrowthEmployeeDrilldownData;
}

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const BADGE_BASE =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/** 行转化率：末级 ÷ 首级（分享），首级为 0 时显示「—」 */
function rowConversion(steps: GrowthEmployeeDrilldownData["items"][number]["steps"]): string {
  const first = steps[0];
  const last = steps[steps.length - 1];
  if (!first || !last || first.value <= 0) return "—";
  return `${((last.value / first.value) * 100).toFixed(1)}%`;
}

/**
 * 员工维度漏斗下钻表（对齐设计稿 Screen 3 下钻区）：
 * 列由后端 steps 标签驱动（招募 7 级 / 其余模块 4 级），
 * 未归因聚合行（employee_id=null）置于末尾，底部合计与单模块漏斗一致。
 */
export function FunnelDrilldown({ data }: FunnelDrilldownProps) {
  const { items } = data;
  const moduleMeta = GROWTH_MODULE_META[data.module];
  // 列头由首行 steps 标签驱动（同一响应内各级结构一致）
  const stepLabels = items[0]?.steps.map((step) => step.label) ?? [];

  // 各级合计（用于校验与单模块漏斗口径一致）
  const totals = items[0]?.steps.map((_, level) =>
    items.reduce((sum, row) => sum + (row.steps[level]?.value ?? 0), 0),
  );

  return (
    <div className="bg-white rounded-cards shadow-steep overflow-hidden">
      <div className="px-6 py-5 border-b border-fog">
        <div className="text-[15px] font-medium text-ink">员工维度下钻</div>
        <div className="mt-0.5 text-[13px] text-graphite">
          {moduleMeta.label}模块 · 近 {data.days} 天 · 各级合计与上方漏斗一致 · 含未归因（referrer
          为空）聚合行
        </div>
      </div>

      {items.length === 0 || stepLabels.length === 0 ? (
        <div className="px-6 py-12 text-center text-[14px] text-slate">暂无员工下钻数据</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]" style={{ minWidth: 900 }}>
              <thead>
                <tr className="text-left text-[13px] font-medium text-graphite whitespace-nowrap">
                  <th className="px-5 py-3 border-b border-fog">员工</th>
                  {stepLabels.map((label) => (
                    <th key={label} className="px-5 py-3 border-b border-fog">
                      {label}
                    </th>
                  ))}
                  <th className="px-5 py-3 border-b border-fog">转化率</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr
                    key={row.employee_id ?? "unattributed"}
                    className="hover:bg-fog transition-colors"
                  >
                    <td className="px-5 py-3.5 border-b border-fog align-middle">
                      <div className="font-medium text-ink whitespace-nowrap">
                        {row.employee_name ?? "未归因"}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-graphite">
                        {row.employee_id ?? "—"}
                      </div>
                    </td>
                    {row.steps.map((step) => (
                      <td
                        key={step.key}
                        className="px-5 py-3.5 border-b border-fog align-middle tabular-nums"
                      >
                        {step.value.toLocaleString()}
                      </td>
                    ))}
                    <td className="px-5 py-3.5 border-b border-fog align-middle">
                      <span className={`${BADGE_BASE} ${RECRUIT_BADGE_CLASS.apricot} tabular-nums`}>
                        {rowConversion(row.steps)}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* 合计行（与单模块漏斗一致） */}
                <tr className="bg-fog/60">
                  <td className="px-5 py-3.5 border-b border-fog align-middle font-medium text-ink">
                    合计
                  </td>
                  {totals?.map((value, level) => (
                    <td
                      key={stepLabels[level]}
                      className="px-5 py-3.5 border-b border-fog align-middle tabular-nums font-medium text-ink"
                    >
                      {value.toLocaleString()}
                    </td>
                  ))}
                  <td className="px-5 py-3.5 border-b border-fog align-middle" />
                </tr>
              </tbody>
            </table>
          </div>

          <DesignPagination info={`共 ${items.length} 行（含未归因）`} page={1} totalPages={1} />
        </>
      )}
    </div>
  );
}
