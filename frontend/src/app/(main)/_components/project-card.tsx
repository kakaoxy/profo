"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Eye, Wallet, MoreHorizontal, MapPin, Home } from "lucide-react";
import type { components } from "@/lib/api-types";
import { client } from "@/lib/api-client";
import { MarketDataSection } from "./market-data-section";
import { ProjectDetailSheet } from "../projects/_components/project-detail-sheet";
import type { Project } from "../projects/types/project";
import type { SalesRecord } from "../projects/types/sales";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type CommunityMarketStatsResponse = components["schemas"]["CommunityMarketStatsResponse"];
type ApiSalesRecord = {
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

function toNumber(value: string | number | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? undefined : num;
}

function mapProjectResponseToProject(project: ProjectResponse): Project {
  return {
    id: project.id,
    name: project.name ?? "",
    community_id: project.community_id ?? undefined,
    community_name: project.community_name ?? undefined,
    status: project.status,
    address: project.address ?? undefined,
    area: toNumber(project.area),
    layout: project.layout ?? undefined,
    orientation: project.orientation ?? undefined,
    signing_price: toNumber(project.signing_price),
    signing_date: project.signing_date ?? undefined,
    signing_period: project.signing_period ?? undefined,
    extension_period: project.extension_period ?? undefined,
    extension_rent: toNumber(project.extension_rent),
    cost_assumption_type: project.cost_assumption_type ?? undefined,
    cost_assumption_other: project.cost_assumption_other ?? undefined,
    planned_handover_date: project.planned_handover_date ?? undefined,
    other_agreements: project.other_agreements ?? undefined,
    renovation_stage: project.renovation_stage ?? undefined,
    contract_no: project.contract_no ?? undefined,
    list_price: toNumber(project.list_price),
    listing_date: project.listing_date ?? undefined,
    sold_price: toNumber(project.sold_price),
    sold_date: project.sold_date ?? undefined,
    total_income: toNumber(project.total_income),
    total_expense: toNumber(project.total_expense),
    net_cash_flow: toNumber(project.net_cash_flow),
    roi: project.roi ?? undefined,
    project_manager: project.project_manager
      ? {
          id: project.project_manager.id,
          nickname: project.project_manager.nickname ?? undefined,
          username: project.project_manager.username ?? undefined,
          avatar: project.project_manager.avatar ?? undefined,
        }
      : undefined,
    sales_records: project.sales_records
      ? (project.sales_records as Array<{
          id: string;
          record_type: string;
          price?: string | null;
          record_date: string;
          customer_name?: string | null;
          notes?: string | null;
        }>).map(r => ({
          id: r.id,
          project_id: project.id,
          record_type: r.record_type as "viewing" | "offer" | "negotiation" | "sold",
          customer_name: r.customer_name ?? undefined,
          price: r.price ? parseFloat(r.price) : undefined,
          record_date: r.record_date,
          notes: r.notes ?? undefined,
        }))
      : undefined,
    created_at: project.created_at ?? "",
    updated_at: project.updated_at ?? "",
  };
}

export function ProjectCard({ project }: ProjectCardProps) {
  const [marketData, setMarketData] = useState<CommunityMarketStatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    // 用于防止竞态条件和重复设置状态
    let isMounted = true;
    const abortController = new AbortController();

    const fetchMarketData = async () => {
      if (!project.community_id) return;

      setIsLoading(true);
      try {
        const { data, error, response } = await client.GET("/api/v1/monitor/communities/{community_id}/market-stats", {
          params: {
            path: { community_id: project.community_id },
          },
          signal: abortController.signal,
        });

        // 组件已卸载，不更新状态
        if (!isMounted) return;

        if (error) {
          // 404 是预期内的错误（该小区暂无市场数据），不打印错误日志
          if (response?.status === 404) {
            console.log(`[ProjectCard] 小区 ${project.community_id} 暂无市场数据`);
          } else {
            // 其他错误打印警告级别日志
            console.warn("[ProjectCard] 获取市场数据失败:", {
              status: response?.status,
              statusText: response?.statusText,
              communityId: project.community_id,
            });
          }
        } else if (data) {
          setMarketData(data);
        }
      } catch (error) {
        // 组件已卸载，忽略所有错误
        if (!isMounted) return;

        // 忽略 AbortError，这是正常的取消行为
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch market data:", error instanceof Error ? error.message : String(error));
      } finally {
        // 组件已卸载，不更新状态
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchMarketData();

    return () => {
      isMounted = false;
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

  const salesRecords = (project.sales_records || []) as ApiSalesRecord[];

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

  const hasCommunityId = !!project.community_id;

  const projectData = mapProjectResponseToProject(project);

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.01 }}
        onClick={() => setIsDetailOpen(true)}
        className="bg-white rounded-xl border border-slate-200 shadow-card overflow-hidden flex flex-col hover:border-primary/40 transition-all group cursor-pointer"
      >
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex justify-between items-start mb-1">
            <span className="text-[10px] text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
              #{contractNo}
            </span>
            <MoreHorizontal className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
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
            <MarketDataSection
              hasCommunityId={hasCommunityId}
              isLoading={isLoading}
              marketData={marketData}
            />
          </div>
        </div>
      </motion.div>

      <ProjectDetailSheet
        project={projectData}
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
      />
    </>
  );
}
