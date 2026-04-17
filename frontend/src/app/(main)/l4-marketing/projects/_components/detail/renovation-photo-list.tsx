"use client";

import { memo, useMemo, useCallback } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { L4MarketingMedia } from "../../types";
import { RENOVATION_STAGES } from "../../types";
import { OptimizedPhotoItem } from "./optimized-photo-item";
import { DroppableStage } from "../photo-manager/droppable-stage";
import { usePerformanceMonitor } from "./performance-monitor";

const CONTAINER_RENOVATION_PREFIX = "renovation-";

interface RenovationPhotoListProps {
  photos: L4MarketingMedia[];
  activeId: number | null;
  getStageIds: (stage: string) => number[];
  onDelete: (photoId: number) => void;
}

export const RenovationPhotoList = memo(function RenovationPhotoList({
  photos,
  activeId,
  getStageIds,
  onDelete,
}: RenovationPhotoListProps) {
  // 性能监控
  usePerformanceMonitor("RenovationPhotoList", {
    enableFPS: false,
    logToConsole: false,
  });

  // 按阶段分组照片 - 使用 useMemo 缓存
  const photosByStage = useMemo(() => {
    return photos.reduce((grouped, photo) => {
      const stage = photo.renovation_stage || "other";
      if (!grouped[stage]) grouped[stage] = [];
      grouped[stage].push(photo);
      return grouped;
    }, {} as Record<string, L4MarketingMedia[]>);
  }, [photos]);

  // 使用 useCallback 稳定 onDelete 回调
  const handleDelete = useCallback(
    (photoId: number) => {
      onDelete(photoId);
    },
    [onDelete]
  );

  // 渲染阶段照片列表 - 使用 useMemo 缓存
  const renderStagePhotos = useCallback(
    (stagePhotos: L4MarketingMedia[]) => {
      return stagePhotos.map((photo, index) => (
        <OptimizedPhotoItem
          key={photo.id}
          photo={photo}
          index={index}
          onDelete={handleDelete}
        />
      ));
    },
    [handleDelete]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-emerald-600">
          改造照片 ({photos.length})
        </h4>
        <span className="text-xs text-slate-400">
          {activeId ? "拖拽到目标阶段" : "支持跨阶段拖拽"}
        </span>
      </div>

      <div 
        className="space-y-3 min-h-[80px] max-h-[300px] overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200"
        style={{
          // 优化滚动性能
          willChange: "scroll-position",
          // 使用 GPU 加速
          transform: "translateZ(0)",
          // 减少重绘区域
          contain: "layout style paint",
        }}
      >
        {/* 拖拽时显示所有阶段，平常只显示有照片的阶段 */}
        {activeId
          ? // 拖拽模式：显示所有阶段作为放置目标
            RENOVATION_STAGES.map((stageConfig) => {
              const stage = stageConfig.value;
              const stagePhotos = photosByStage[stage] || [];
              const containerId = `${CONTAINER_RENOVATION_PREFIX}${stage}`;

              return (
                <div key={stage} className="space-y-1">
                  <div className="text-xs font-medium text-slate-500 px-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {stageConfig.label} ({stagePhotos.length})
                  </div>
                  <SortableContext
                    items={getStageIds(stage)}
                    strategy={verticalListSortingStrategy}
                  >
                    <DroppableStage
                      id={containerId}
                      isEmpty={stagePhotos.length === 0}
                      isActive={true}
                    >
                      {stagePhotos.length === 0 && (
                        <div className="text-center text-xs text-emerald-600/60">
                          拖拽到此处
                        </div>
                      )}
                      {renderStagePhotos(stagePhotos)}
                    </DroppableStage>
                  </SortableContext>
                </div>
              );
            })
          : // 平常模式：只显示有照片的阶段，但按 RENOVATION_STAGES 顺序
            RENOVATION_STAGES.map((stageConfig) => {
              const stage = stageConfig.value;
              const stagePhotos = photosByStage[stage] || [];
              if (stagePhotos.length === 0) return null;

              const containerId = `${CONTAINER_RENOVATION_PREFIX}${stage}`;

              return (
                <div key={stage} className="space-y-1">
                  <div className="text-xs font-medium text-slate-500 px-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    {stageConfig.label} ({stagePhotos.length})
                  </div>
                  <SortableContext
                    items={getStageIds(stage)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      id={containerId}
                      className="space-y-2 min-h-[40px] p-1 rounded border border-dashed border-slate-300 hover:border-emerald-400 transition-colors"
                    >
                      {renderStagePhotos(stagePhotos)}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
      </div>
    </div>
  );
});
