"use client";

import { cn } from "@/lib/utils";
import { Project } from "../../../../types";
import { getDaysUntil } from "../../utils";

interface ProjectSummaryProps {
  project: Project;
}

/** 委托期限月数：起止月份差（不足整月扣 1），任一日期缺失/倒置返回 null */
function getCommissionMonths(project: Project): number | null {
  const start = project.commission_start_date?.slice(0, 10);
  const end = project.commission_end_date?.slice(0, 10);
  if (!start || !end) return null;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const months = (ey - sy) * 12 + (em - sm) - (ed < sd ? 1 : 0);
  return months >= 0 ? months : null;
}

/** ISO 日期字符串 → YYYY.MM.DD（非法/缺失返回 undefined） */
function toDotDate(value?: string | null): string | undefined {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : undefined;
}

/** 签约单价（万/㎡，两位小数）；签约价或面积缺失返回 null */
function getUnitPrice(project: Project): string | null {
  if (!project.signing_price || !project.area) return null;
  return (project.signing_price / project.area).toFixed(2);
}

/**
 * 项目摘要组件 - 展示关键指标卡片
 * V4.2 设计稿 1:1：暖/冷 wash 数据卡无阴影（.kpi.warm/.kpi.cool box-shadow:none），
 * 白卡保留三层签名阴影；label 13px graphite · 值 30px 衬线 · delta 12px graphite。
 * - 签约总价：warm apricot 底，值 rust，delta = 签约单价
 * - 净现金流：白卡，正值设计稿绿 #3d7a4e / 负值红（色阶标识）
 * - 距交房：cool sky 底，值按临近/超期变色，delta = 计划交房日期
 * - 委托期限：白卡，值 = 月数，delta = 起止日期范围
 */
export function ProjectSummary({ project }: ProjectSummaryProps) {
  const daysUntilHandover = getDaysUntil(project.planned_handover_date);
  const netCashFlow = (project.net_cash_flow || 0) / 10000;
  const isProfitable = netCashFlow >= 0;

  const commissionMonths = getCommissionMonths(project);
  const commissionStart = toDotDate(project.commission_start_date);
  const commissionEnd = toDotDate(project.commission_end_date);
  const unitPrice = getUnitPrice(project);
  const handoverDate = toDotDate(project.planned_handover_date);

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {/* 签约总价 — 价格类 · 暖底（无阴影） */}
      <div className="rounded-cards bg-apricot-wash p-5 font-sohne">
        <p className="text-[13px] font-[450] text-graphite">签约总价</p>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em] text-rust">
            {project.signing_price ? project.signing_price.toLocaleString() : "-"}
          </span>
          <span className="text-sm font-[430] text-graphite">万</span>
        </div>
        {unitPrice && (
          <p className="mt-2 text-xs font-[450] text-graphite">单价 {unitPrice} 万/㎡</p>
        )}
      </div>

      {/* 净现金流 — 白卡 · 正负以色阶标识（正值设计稿绿 #3d7a4e / 负值红） */}
      <div className="rounded-cards bg-pure-white p-5 font-sohne shadow-steep">
        <p className="text-[13px] font-[450] text-graphite">净现金流（预估）</p>
        <div
          className={cn(
            "mt-1.5 flex items-baseline gap-1",
            isProfitable ? "text-[#3d7a4e]" : "text-error",
          )}
        >
          <span className="font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em]">
            {project.net_cash_flow !== undefined
              ? (isProfitable ? "+" : "") + netCashFlow.toLocaleString()
              : "-"}
          </span>
          <span className="text-sm font-[430] text-graphite">万</span>
        </div>
      </div>

      {/* 距交房 — 天数类 · 冷底（≤7 天橙色提醒 · 超期红色，无阴影） */}
      <div className="rounded-cards bg-sky-wash p-5 font-sohne">
        <p className="text-[13px] font-[450] text-graphite">距交房</p>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span
            className={cn(
              "font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em] text-ink",
              daysUntilHandover !== null && daysUntilHandover < 0 && "text-error",
              daysUntilHandover !== null && daysUntilHandover >= 0 && daysUntilHandover <= 7
                ? "text-status-renovating"
                : "text-ink",
            )}
          >
            {daysUntilHandover !== null ? Math.abs(daysUntilHandover) : "-"}
          </span>
          <span className="text-sm font-[430] text-graphite">
            {daysUntilHandover !== null ? (daysUntilHandover >= 0 ? "天" : "天 (已超时)") : ""}
          </span>
        </div>
        {handoverDate && (
          <p className="mt-2 text-xs font-[450] text-graphite">计划交房 {handoverDate}</p>
        )}
      </div>

      {/* 委托期限 — 白卡 */}
      <div className="rounded-cards bg-pure-white p-5 font-sohne shadow-steep">
        <p className="text-[13px] font-[450] text-graphite">委托期限</p>
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="font-signifier text-[30px] font-[480] leading-[1.15] tracking-[-0.02em] text-ink">
            {commissionMonths !== null ? commissionMonths : "—"}
          </span>
          {commissionMonths !== null && (
            <span className="text-sm font-[430] text-graphite">个月</span>
          )}
        </div>
        {commissionStart && commissionEnd && (
          <p className="mt-2 text-xs font-[450] text-graphite">
            {commissionStart} – {commissionEnd}
          </p>
        )}
      </div>
    </div>
  );
}
