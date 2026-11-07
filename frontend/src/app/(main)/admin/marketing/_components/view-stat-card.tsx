"use client";

import { memo } from "react";
import { Eye, Users } from "lucide-react";
import type { L4MarketingProject } from "@/app/(main)/admin/marketing/types";

interface ViewStatCardProps {
  project: L4MarketingProject;
}

/** 浏览统计卡：累计 PV/UV + 近 7 日浏览次数迷你柱图。 */
export const ViewStatCard = memo(function ViewStatCard({ project }: ViewStatCardProps) {
  const summary = project.view_summary;
  const viewCount = summary?.view_count ?? 0;
  const visitorCount = summary?.visitor_count ?? 0;
  const perVisitor = visitorCount > 0 ? (viewCount / visitorCount).toFixed(1) : "0.0";
  const daily = summary?.daily_views ?? [];
  const maxDaily = Math.max(...daily.map((item) => item.count), 1);
  const isPublished = project.publish_status === "发布";

  return (
    <section id="view-stat-card" className="rounded-cards bg-white p-5 shadow-steep-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-graphite">
            Reach <span className="text-dove">/</span> 浏览
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-display text-[42px] leading-none tracking-[-0.03em] text-ink tabular-nums">
              {viewCount.toLocaleString()}
            </span>
            <span className="text-[11px] text-graphite">次浏览</span>
          </div>
        </div>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-apricot-wash text-rust">
          <Eye className="h-4 w-4" />
        </span>
      </div>

      {isPublished ? (
        <>
          <div className="mt-5 grid grid-cols-2 divide-x divide-dove/30 rounded-2xl bg-fog/70 py-3">
            <div className="px-3">
              <div className="flex items-center gap-1.5 text-[10px] text-graphite">
                <Users className="h-3 w-3" />
                浏览人数
              </div>
              <div className="mt-1.5 text-[17px] font-medium text-ink tabular-nums">
                {visitorCount.toLocaleString()}
                <span className="ml-1 text-[10px] font-normal text-graphite">人</span>
              </div>
            </div>
            <div className="px-3">
              <div className="text-[10px] text-graphite">人均浏览</div>
              <div className="mt-1.5 text-[17px] font-medium text-ink tabular-nums">
                {perVisitor}
                <span className="ml-1 text-[10px] font-normal text-graphite">次 / 人</span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-[10px] text-graphite">
              <span>近 7 日浏览</span>
              <span className="tabular-nums">
                {daily.reduce((sum, item) => sum + item.count, 0).toLocaleString()} 次
              </span>
            </div>
            <div className="mt-3 flex h-14 items-end gap-1.5">
              {daily.length > 0 ? (
                daily.map((item) => (
                  <div key={item.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="w-full rounded-t-[3px] bg-ink/15 transition-colors group-hover:bg-rust/70"
                      style={{ height: `${Math.max((item.count / maxDaily) * 100, item.count > 0 ? 8 : 2)}%` }}
                      title={`${item.date} · ${item.count} 次`}
                    />
                  </div>
                ))
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-fog text-[10px] text-dove">
                  暂无按日数据
                </div>
              )}
            </div>
            {daily.length > 0 ? (
              <div className="mt-2 flex justify-between text-[9px] text-dove">
                <span>{daily[0]?.date.slice(5)}</span>
                <span>{daily[daily.length - 1]?.date.slice(5)}</span>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-2xl bg-fog px-4 py-5 text-[11px] leading-relaxed text-graphite">
          发布房源后开始统计浏览。浏览数据来自客户端详情页访问，按 visitor_id 去重，不包含管理后台预览。
        </div>
      )}

      <p className="mt-4 border-t border-dove/30 pt-3 text-[10px] leading-relaxed text-dove">
        统计来自客户端房源详情页访问；同一设备按 visitor_id 去重，不包含管理后台预览。
      </p>
    </section>
  );
});
