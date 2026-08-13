"use client";

import { toast } from "sonner";
import type { RecruitEmployee, RecruitFunnelData } from "../../types";
import { RECRUIT_BADGE_CLASS } from "../../types";
import { DesignPagination } from "../../_components/design-pagination";

export interface EmployeeFunnelRow {
  employee: RecruitEmployee;
  data: RecruitFunnelData;
}

interface FunnelEmployeesProps {
  rows: EmployeeFunnelRow[];
}

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const badgeBase =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/** 转化率阈值：≥7% 用 Apricot 强调，否则中性灰（对齐设计稿示例配色） */
const CONVERSION_HIGHLIGHT = 0.07;

/**
 * 员工维度 · 拉新贡献表（对齐设计稿 F3 下钻表）：
 * 员工 / 分享次数 / 打开(PV) / 深度浏览 / 点击授权 / 留资数 / 有效新客 / 转化率。
 * 行可点击（二期下钻该员工完整漏斗与线索明细）。
 */
export function FunnelEmployees({ rows }: FunnelEmployeesProps) {
  const handleRowClick = (row: EmployeeFunnelRow) => {
    toast(`下钻「${row.employee.name}」近 30 天漏斗与线索明细（二期接入）`);
  };

  return (
    <div className="bg-white rounded-cards shadow-steep overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-fog">
        <div>
          <div className="text-[15px] font-medium text-ink">
            员工维度 · 拉新贡献
          </div>
          <div className="mt-0.5 text-[13px] text-graphite">
            点击员工行可下钻至该员工的完整漏斗与线索明细
          </div>
        </div>
        <button
          type="button"
          className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
          onClick={() => toast("导出员工贡献报表二期接入")}
        >
          导出
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[13px] font-medium text-graphite whitespace-nowrap">
              <th className="px-5 py-3 border-b border-fog">员工</th>
              <th className="px-5 py-3 border-b border-fog">分享次数</th>
              <th className="px-5 py-3 border-b border-fog">打开(PV)</th>
              <th className="px-5 py-3 border-b border-fog">深度浏览</th>
              <th className="px-5 py-3 border-b border-fog">点击授权</th>
              <th className="px-5 py-3 border-b border-fog">留资数</th>
              <th className="px-5 py-3 border-b border-fog">有效新客</th>
              <th className="px-5 py-3 border-b border-fog">转化率</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { shared, pv, deep_view, clicked_auth, authed, valid_new } =
                row.data;
              const conversion =
                shared > 0 ? (valid_new / shared) * 100 : 0;
              const highlight = conversion >= CONVERSION_HIGHLIGHT * 100;
              return (
                <tr
                  key={row.employee.id}
                  className="hover:bg-fog transition-colors cursor-pointer"
                  onClick={() => handleRowClick(row)}
                  title="点击下钻该员工漏斗与线索明细"
                >
                  <td className="px-5 py-3.5 border-b border-fog align-middle">
                    <div className="font-medium text-ink whitespace-nowrap">
                      {row.employee.name}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-graphite">
                      {row.employee.id}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle tabular-nums">
                    {shared}
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle tabular-nums">
                    {pv}
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle tabular-nums">
                    {deep_view}
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle tabular-nums">
                    {clicked_auth}
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle tabular-nums">
                    {authed}
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle">
                    <b className="font-medium text-ink tabular-nums">
                      {valid_new}
                    </b>
                  </td>
                  <td className="px-5 py-3.5 border-b border-fog align-middle">
                    <span
                      className={`${badgeBase} ${
                        highlight
                          ? RECRUIT_BADGE_CLASS.apricot
                          : RECRUIT_BADGE_CLASS.neutral
                      }`}
                    >
                      {conversion.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <DesignPagination
        info={`共 ${rows.length} 名员工参与分享`}
        page={1}
        totalPages={1}
      />
    </div>
  );
}
