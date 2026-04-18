"use client";

import { useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "../section-header";
import { Button } from "@/components/ui/button";
import { CompetitorManagerModal } from "../competitor-manager-modal";
import { useRadarData } from "./use-radar-data";
import { RadarTable } from "./radar-table";
import { RadarCards } from "./radar-cards";

interface NeighborhoodRadarProps {
  projectId?: string;
  communityName?: string;
}

export function NeighborhoodRadar({
  projectId,
  communityName,
}: NeighborhoodRadarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { competitors, loading, error, refresh } = useRadarData({
    projectId,
    communityName,
  });

  return (
    <section className="mt-8 pb-10 relative">
      <SectionHeader
        index="2"
        title="周边竞品雷达"
        subtitle="Neighborhood Radar"
        action={
          projectId || communityName ? (
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

      <div className="px-4 sm:px-6">
        <Card className="border-slate-100 shadow-sm overflow-hidden bg-white">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              <span className="ml-2 text-sm text-slate-500">加载中...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-slate-500">
              {error}
            </div>
          ) : competitors.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">
              暂无竞品数据，请先添加竞品小区
            </div>
          ) : (
            <>
              <RadarCards competitors={competitors} />
              <RadarTable competitors={competitors} />
            </>
          )}
        </Card>
      </div>

      {isModalOpen && (projectId || communityName) && (
        <CompetitorManagerModal
          projectId={projectId}
          communityName={communityName}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onUpdate={refresh}
        />
      )}
    </section>
  );
}
