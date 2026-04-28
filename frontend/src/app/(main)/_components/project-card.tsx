"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, Wallet, MoreHorizontal, MapPin, Home, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { components } from "@/lib/api-types";
import { client } from "@/lib/api-client";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];
type SalesRecord = {
  id: string;
  record_type: string;
  price?: string | null;
  record_date: string;
  customer_name?: string | null;
  notes?: string | null;
};

interface ProjectCardProps {
  project: ProjectResponse;
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [marketData, setMarketData] = useState<CommunityMarketStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchMarketData = async () => {
      if (!project.community_id) return;
      
      setIsLoading(true);
      try {
        const { data, error } = await client.GET("/api/v1/monitor/communities/{community_id}/market-stats", {
          params: {
            path: { community_id: project.community_id },
          },
          signal: abortController.signal,
        });
        if (error) {
          console.error("Failed to fetch market data:", error);
        } else if (data) {
          setMarketData(data);
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch market data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarketData();
    
    return () => {
      abortController.abort();
    };
  }, [project.community_id]);

  const contractNo = project.contract_no || "N/A";
  const communityName = project.community_name || "未命名项目";
  const address = project.address || "地址未填写";
  const layout = project.layout || "-";
  const area = project.area ? `${project.area}㎡` : "-";

  const listPrice = project.list_price ? `${project.list_price}万` : "未定价";
  const soldPrice = project.sold_price ? `${project.sold_price}万` : "-";

  const statusMap: Record<string, { label: string; color: string }> = {
    signing: { label: "已签约", color: "bg-blue-100 text-blue-700" },
    renovating: { label: "装修中", color: "bg-yellow-100 text-yellow-700" },
    selling: { label: "在售中", color: "bg-green-100 text-green-700" },
    sold: { label: "已成交", color: "bg-purple-100 text-purple-700" },
  };
  const statusInfo = statusMap[project.status] || { label: project.status, color: "bg-gray-100 text-gray-700" };

  const salesRecords = (project.sales_records || []) as SalesRecord[];

  const viewingRecords = salesRecords.filter(r => r.record_type === "viewing");
  const offerRecords = salesRecords.filter(r => r.record_type === "offer");

  const viewTotal = viewingRecords.length;

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  const currentWeekViews = viewingRecords.filter(r => new Date(r.record_date) >= oneWeekAgo).length;
  const lastWeekViews = viewingRecords.filter(r => {
    const d = new Date(r.record_date);
    return d >= twoWeeksAgo && d < oneWeekAgo;
  }).length;

  const viewTrendIsUp = currentWeekViews >= lastWeekViews;

  const offerCount = offerRecords.length;

  const offerPrices = offerRecords
    .map(r => r.price ? parseFloat(r.price) : null)
    .filter((p): p is number => p !== null && !isNaN(p));

  const maxOffer = offerPrices.length > 0 ? Math.max(...offerPrices) : 0;
  const lastOffer = offerPrices.length > 0 ? offerPrices[offerPrices.length - 1] : 0;

  // 格式化市场数据
  const onSaleCount = marketData?.on_sale ?? 0;
  const avgPriceWan = marketData?.avg_price ? (marketData.avg_price / 10000).toFixed(1) : "-";
  const volume30d = marketData?.volume_30d ?? 0;
  const priceTrend30d = marketData?.price_trend_30d ?? 0;
  const isPriceUp = marketData?.is_price_up ?? null;
  const priceTrendText = priceTrend30d > 0 ? `+${priceTrend30d.toFixed(1)}%` : `${priceTrend30d.toFixed(1)}%`;

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
            #{contractNo}
          </span>
          <MoreHorizontal className="w-4 h-4 text-slate-300 group-hover:text-primary cursor-pointer transition-colors" />
        </div>
        <h4 className="text-lg font-semibold text-on-surface truncate">
          {communityName}
        </h4>
        <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
          <MapPin className="w-3 h-3" />
          {address}
        </p>
        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
          <Home className="w-3 h-3" />
          {layout} · {area}
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
                {viewTotal} 次
              </span>
            </div>
            <div className="flex justify-between items-center">
              <div className="text-xs text-slate-500 ml-6">本周/上周</div>
              <div
                className={`text-xs font-semibold ${
                  viewTrendIsUp ? "text-tertiary" : "text-error"
                }`}
              >
                {currentWeekViews} / {lastWeekViews}
                <span className="ml-1">
                  {viewTrendIsUp ? "↑" : "↓"}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center border-t border-slate-50 pt-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-600">收到出价</span>
              </div>
              <span className="text-sm font-bold">
                {offerCount} 个
              </span>
            </div>

            <div className="bg-slate-50 p-2 rounded-lg space-y-1 h-12 flex flex-col justify-center">
              {offerCount > 0 ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-slate-400">最高出价 Max</span>
                    <span className="text-[10px] font-bold text-primary">
                      ¥ {maxOffer}万
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[10px] text-slate-400">最后出价 Last</span>
                    <span className="text-[10px] font-bold text-on-surface">
                      ¥ {lastOffer}万
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
              <p className="text-sm font-bold">
                {isLoading ? "-" : `${onSaleCount} 套`}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">成交均价</p>
              <p className="text-sm font-bold">
                {isLoading ? "-" : `${avgPriceWan}万/㎡`}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">30日成交</p>
              <p className="text-sm font-bold">
                {isLoading ? "-" : `${volume30d} 套`}
              </p>
            </div>
            <div className="space-y-0.5">
              <p className="text-[10px] text-slate-400">30日趋势</p>
              <p
                className={`text-sm font-bold flex items-center gap-1 ${
                  isPriceUp === true
                    ? "text-primary"
                    : isPriceUp === false
                    ? "text-error"
                    : "text-slate-400"
                }`}
              >
                {isPriceUp === true ? (
                  <TrendingUp className="w-3 h-3" />
                ) : isPriceUp === false ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {isLoading ? "-" : priceTrendText}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
