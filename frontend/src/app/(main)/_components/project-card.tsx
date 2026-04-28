"use client";

import { motion } from "framer-motion";
import { Eye, Wallet, MoreHorizontal } from "lucide-react";
import type { Project } from "../types";

interface ProjectCardProps {
  project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex flex-col hover:border-primary/40 transition-all group"
    >
      <div className="p-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex justify-between items-start mb-1">
          <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
            #{project.code}
          </span>
          <MoreHorizontal className="w-4 h-4 text-slate-300 group-hover:text-primary cursor-pointer transition-colors" />
        </div>
        <h4 className="text-lg font-semibold text-on-surface truncate">
          {project.name}
        </h4>
        <p className="text-xs text-slate-400">
          {project.location} · {project.specs}
        </p>
      </div>

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">
            项目动态 STATS
          </span>
          <div className="space-y-3 min-h-[140px]">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">带看总量</span>
              </div>
              <span className="text-sm font-bold">
                {project.stats.viewTotal} 次
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs text-slate-500 ml-6">本周/上周</div>
              <div
                className={`text-xs font-semibold ${
                  project.stats.viewTrend.isUp ? "text-tertiary" : "text-error"
                }`}
              >
                {project.stats.viewTrend.current} / {project.stats.viewTrend.last}
                <span className="ml-1">
                  {project.stats.viewTrend.isUp ? "↑" : "↓"}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center border-t border-slate-50 pt-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">收到出价</span>
              </div>
              <span className="text-sm font-bold">
                {project.stats.offerCount} 个
              </span>
            </div>

            <div className="bg-slate-50 p-2 rounded-lg space-y-1 h-12 flex flex-col justify-center">
              {project.stats.offerCount > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-slate-400">最高出价 Max</span>
                    <span className="text-[10px] font-bold text-primary">
                      ¥ {project.stats.maxOffer}万
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-slate-400">最后出价 Last</span>
                    <span className="text-[10px] font-bold text-on-surface">
                      ¥ {project.stats.lastOffer}万
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex justify-center text-[10px] text-slate-400">
                  暂无出价 No Offers
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="py-2">
          <div className="border-t border-dashed border-slate-200"></div>
        </div>

        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">
            市场数据 MARKET
          </span>
          <div className="grid grid-cols-2 gap-3 min-h-[70px]">
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">竞品在售</p>
              <p className="text-sm font-bold">{project.market.onSale} 套</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">成交均价</p>
              <p className="text-sm font-bold">{project.market.avgPrice}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">30日成交</p>
              <p className="text-sm font-bold">{project.market.volume30d} 套</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">30日趋势</p>
              <p
                className={`text-sm font-bold ${
                  project.market.isPriceUp === true
                    ? "text-primary"
                    : project.market.isPriceUp === false
                    ? "text-error"
                    : "text-slate-400"
                }`}
              >
                {project.market.priceTrend30d}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
