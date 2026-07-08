import type { components } from "@/lib/api-types";
import { formatNumber } from "./format";

type ProjectBaseStats = components["schemas"]["LedgerStatisticsProjectBase"];

interface ProjectBaseCardProps {
  data: ProjectBaseStats;
}

/**
 * 项目基础信息卡片
 * - 小区名称 (Signifier 22px) + 状态徽章
 * - 项目地址 / 产证面积 / 交房时间 / 成交时间
 * - 项目天数高亮块 (Apricot Wash 底, Rust 44px Signifier)
 */
export function ProjectBaseCard({ data }: ProjectBaseCardProps) {
  const dealDate = data.deal_date || "未成交";
  const projectDays = data.project_days ?? 0;

  // 进度条宽度依据项目周期数据:
  // - 已成交(有 deal_date)→ 100%(周期完成)
  // - 未交房(无 delivery_date)→ 0%(周期未开始)
  // - 已交房但未成交 → ⚠️占位值,缺少目标周期数据无法计算进度
  const progressWidth = data.deal_date
    ? "100%"
    : data.delivery_date
      ? "65%" // ⚠️占位值,待接入目标周期数据
      : "0%";

  return (
    <div className="bg-white rounded-[24px] p-6 shadow-[rgba(4,23,43,0.04)_0px_0px_0px_1px,rgba(0,0,0,0.06)_0px_12px_16px_-4px] h-full animate-in" style={{ animationDelay: "0.25s" }}>
      {/* Section header */}
      <div className="mb-5 pb-4 border-b border-dove/25">
        <h2 className="text-[26px] leading-[1.18] tracking-[-0.23px] text-ink text-balance">
          项目基础信息
        </h2>
        <p className="text-[14px] leading-[1.5] mt-1 text-graphite">
          Project Overview
        </p>
      </div>

      <div className="space-y-4">
        {/* 小区名称 + 状态徽章 */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[14px] leading-[1.5] mb-1 text-graphite">
              小区名称
            </p>
            <p className="text-[22px] leading-[1.25] text-ink truncate">
              {data.community_name || "-"}
            </p>
          </div>
          {data.status ? (
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-medium bg-rust/10 text-rust whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-current" />
              {data.status}
            </span>
          ) : null}
        </div>

        {/* 项目地址 */}
        <DataRow label="项目地址" value={data.address || "-"} />

        {/* 产证面积 */}
        <DataRow
          label="产证面积"
          value={
            data.area != null ? `${data.area.toLocaleString("zh-CN")}\u00A0m²` : "-"
          }
        />

        {/* 交房时间 */}
        <DataRow label="交房时间" value={data.delivery_date || "-"} />

        {/* 成交时间 */}
        <DataRow label="成交时间" value={dealDate} />

        {/* 项目天数高亮块 */}
        <div className="mt-6 p-5 rounded-[16px] bg-apricot-wash">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] mb-1 text-graphite">项目天数</p>
              <p className="font-display text-[44px] leading-[1.1] text-rust tabular-nums">
                {formatNumber(projectDays)}
                <span className="text-[18px] ml-1 text-ash">天</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[14px] mb-1 text-graphite">成交 - 交房</p>
              <p className="text-[15px] text-ash">项目周期</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-rust transition-[width] duration-700"
              style={{ width: progressWidth }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b border-dove/25 last:border-b-0">
      <span className="text-[14px] text-graphite">{label}</span>
      <span className="text-[15px] font-medium text-ink text-right break-words">
        {value}
      </span>
    </div>
  );
}
