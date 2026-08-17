"use client";

import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight } from "lucide-react";
import { Project } from "../../../../types";
import { safeFormatDate } from "@/lib/formatters";

/** 万文案：去掉多余的 .0 尾数（29.6 保留、38.0 → 38） */
function formatWan(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

interface FinNode {
  key: string;
  label: string;
  valueText: string | null;
  dateText: string | null;
  warm?: boolean;
}

export function FinancialLifecycle({ project }: { project: Project }) {
  // ---- 取数：价格为万元，投入为元（total_investment 为后端 total_expense 别名） ----
  const signingPrice = Number(project.signing_price || 0);
  const listPrice = Number(project.list_price || 0);
  const soldPrice = Number(project.sold_price || 0);
  const totalInvestment = Number(project.total_investment ?? project.total_expense ?? 0) || 0; // 元
  const totalIncome = Number(project.total_income) || 0; // 元

  const rawSoldDate = project.sold_at || project.sold_date;

  // 装修投入区间：装修开工 → 上架（缺上架则成交），仅起止可得时拼区间
  const renoStartShort = safeFormatDate(project.renovation_start_date, "MM.dd", "");
  const renoEndShort = safeFormatDate(project.listing_date || rawSoldDate, "MM.dd", "");
  const investmentDateText =
    renoStartShort && renoEndShort ? `${renoStartShort} – ${renoEndShort}` : renoStartShort;

  const nodes: FinNode[] = [
    {
      key: "signing",
      label: "签约价",
      valueText: signingPrice > 0 ? formatWan(signingPrice) : null,
      dateText: safeFormatDate(project.signing_date, "yyyy.MM.dd", ""),
    },
    {
      key: "investment",
      label: "装修与持有投入",
      valueText: totalInvestment > 0 ? `-${formatWan(totalInvestment / 10000)}` : null,
      dateText: investmentDateText,
    },
    {
      key: "listing",
      label: "挂牌价",
      valueText: listPrice > 0 ? formatWan(listPrice) : null,
      dateText: safeFormatDate(project.listing_date, "yyyy.MM.dd", ""),
    },
    {
      key: "deal",
      label: "成交价",
      valueText: soldPrice > 0 ? formatWan(soldPrice) : null,
      dateText: safeFormatDate(rawSoldDate, "yyyy.MM.dd", ""),
      warm: true,
    },
  ];

  return (
    <div className="rounded-cards bg-pure-white p-6 shadow-steep-sm">
      {/* 卡头：标题 + 账本入口（与副列快捷入口同一路由 /admin/ledger/{id}） */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-[500] text-ink">财务生命周期</div>
          <div className="mt-0.5 text-[13px] font-[430] text-graphite">
            签约 → 装修投入 → 挂牌 → 成交
          </div>
        </div>
        <Link
          href={`/admin/ledger/${project.id}`}
          className="shrink-0 text-sm font-[450] text-ink hover:underline underline-offset-4"
        >
          查看项目账本 →
        </Link>
      </div>

      {/* 横向 4 金额节点（<md 纵向、箭头旋转 90°） */}
      <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-1">
        {nodes.map((node, idx) => (
          <Fragment key={node.key}>
            <div className="flex-1 px-2 py-1 text-center">
              <div
                className={`text-[21px] font-[480] leading-tight tracking-[-0.02em] tabular-nums ${
                  node.warm ? "text-rust" : "text-ink"
                }`}
              >
                {node.valueText ?? "--"}
                <span className="ml-0.5 text-[12.5px] font-[430] text-graphite">万</span>
              </div>
              <div className="mt-1 text-[12.5px] font-[430] text-graphite">{node.label}</div>
              {node.dateText && (
                <div className="mt-0.5 text-xs font-[430] text-dove">{node.dateText}</div>
              )}
            </div>
            {idx < nodes.length - 1 && (
              <div className="flex items-center justify-center py-0.5 text-dove md:pt-1">
                <ArrowRight className="h-4 w-4 rotate-90 md:rotate-0" />
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* 卡底小字：节点外信息（累计回款）不丢数据 */}
      {totalIncome > 0 && (
        <div className="mt-4 border-t border-[#f0f0f2] pt-3 text-center text-[12.5px] font-[430] text-graphite">
          累计回款（实收）{formatWan(totalIncome / 10000)} 万 ·
          投入含收房、装修、持有成本等全周期支出（详见账本）
        </div>
      )}
    </div>
  );
}
