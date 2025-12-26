"use client";

import React, { useState, useEffect } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  getNeighborhoodRadarAction, 
  getNeighborhoodRadarByCommunityAction,
  NeighborhoodRadarItem 
} from "../../actions/monitor";
import { CompetitorManagerModal } from "./competitor-manager-modal";

interface NeighborhoodRadarProps {
  projectId?: string;
  communityName?: string;
}

export function NeighborhoodRadar({ projectId, communityName }: NeighborhoodRadarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [competitors, setCompetitors] = useState<NeighborhoodRadarItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    
    const loadData = async () => {
      setIsLoading(true);
      setError(null);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;

      if (projectId) {
        result = await getNeighborhoodRadarAction(projectId);
      } else if (communityName) {
        result = await getNeighborhoodRadarByCommunityAction(communityName);
      } else {
        setIsLoading(false);
        return;
      }

      if (isMounted) {
        if (result.success && result.data) {
          setCompetitors(result.data.items || result.data.competitors); // handle different return shapes if any
        } else {
          setError(result.message || "加载失败");
        }
        setIsLoading(false);
      }
    };
    
    loadData();
    return () => { isMounted = false; };
  }, [projectId, communityName, refreshKey]);

  const handleRefresh = () => setRefreshKey((k) => k + 1);

  const getSpreadStyle = (item: NeighborhoodRadarItem) => {
    if (item.is_subject) return "text-slate-400";
    if (item.spread_percent > 0) return "text-blue-500";
    if (item.spread_percent < 0) return "text-rose-500";
    return "text-slate-400";
  };

  const getSpreadIcon = (item: NeighborhoodRadarItem) => {
    if (item.is_subject) return "";
    if (item.spread_percent > 0) return "🔵 ";
    if (item.spread_percent < 0) return "🔴 ";
    return "";
  };

  return (
    <section className="mt-8 pb-10 relative">
      <SectionHeader 
        index="2" 
        title="周边竞品雷达" 
        subtitle="Neighborhood Radar" 
        action={
          (projectId || communityName) ? (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setIsModalOpen(true)}
              className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 gap-1.5 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              管理竞品小区
            </Button>
          ) : undefined
        }
      />
      
      <div className="px-6">
        <Card className="border-slate-100 shadow-sm overflow-hidden bg-white">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">加载中...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-slate-500">{error}</div>
          ) : competitors.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">暂无竞品数据，请先添加竞品小区</div>
          ) : (
            <Table className="min-w-[800px]">
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-b border-slate-100">
                  <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">小区名称</TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">挂牌套数 (渠道)</TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">挂牌均价</TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">成交套数 (渠道)</TableHead>
                  <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">成交均价</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-50">
                {competitors.map((item) => (
                  <TableRow key={item.community_id} className={`${item.is_subject ? "bg-indigo-50/40" : "hover:bg-slate-50"} transition-colors border-none`}>
                    <TableCell className="py-4 px-4">
                      <span className="text-sm font-bold text-slate-800">{item.community_name}</span>
                    </TableCell>
                    <TableCell className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{item.listing_count} 套</span>
                        <span className="text-[10px] text-slate-400 font-medium">贝壳:{item.listing_beike} | 我爱:{item.listing_iaij}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-4">
                      <span className="text-sm font-bold text-indigo-600">¥ {item.listing_avg_price.toLocaleString()} /㎡</span>
                    </TableCell>
                    <TableCell className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-900">{item.deal_count} 套</span>
                        <span className="text-[10px] text-slate-400 font-medium">贝壳:{item.deal_beike} | 我爱:{item.deal_iaij}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 px-4 text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-emerald-600">¥ {item.deal_avg_price.toLocaleString()} /㎡</span>
                        <span className={`text-[10px] font-bold mt-0.5 ${getSpreadStyle(item)}`}>
                          {getSpreadIcon(item)}{item.spread_label}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      {isModalOpen && (projectId || communityName) && (
        <CompetitorManagerModal
          projectId={projectId}
          communityName={communityName}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onUpdate={handleRefresh}
        />
      )}
    </section>
  );
}
