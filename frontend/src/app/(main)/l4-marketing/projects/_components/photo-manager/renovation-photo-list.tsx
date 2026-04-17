"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { L4MarketingMedia } from "../../types";
import { RENOVATION_STAGES } from "../../types";
import { SortablePhotoItem } from "./sortable-photo-item";
import { DroppableStage } from "./droppable-stage";

const CONTAINER_RENOVATION_PREFIX = "renovation-";

interface RenovationPhotoListProps {
  photos: L4MarketingMedia[];
  activeId: number | null;
  getStageIds: (stage: string) => number[];
  onDelete: (photoId: number) => void;
}

export function RenovationPhotoList({
  photos,
  activeId,
  getStageIds,
  onDelete,
}: RenovationPhotoListProps) {
  // 按阶段分组照片
  const photosByStage = photos.reduce((grouped, photo) => {
    const stage = photo.renovation_stage || "other";
    if (!grouped[stage]) grouped[stage] = [];
    grouped[stage].push(photo);
    return grouped;
  }, {} as Record<string, L4MarketingMedia[]>);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#22c55e]">
          改造照片 ({photos.length})
        </h4>
        <span className="text-xs text-[#707785]">
          {activeId ? "拖拽到目标阶段" : "支持跨阶段拖拽"}
        </span>
      </div>

      <div className="space-y-3 min-h-[100px] max-h-[400px] overflow-y-auto p-2 bg-white rounded-lg border border-[#c0c7d6]/20">
        {/* 拖拽时显示所有阶段，平常只显示有照片的阶段 */}
        {activeId
          ? // 拖拽模式：显示所有阶段作为放置目标
            RENOVATION_STAGES.map((stageConfig) => {
              const stage = stageConfig.value;
              const stagePhotos = photosByStage[stage] || [];
              const containerId = `${CONTAINER_RENOVATION_PREFIX}${stage}`;

              return (
                <div key={stage} className="space-y-1">
                  <div className="text-xs font-medium text-[#707785] px-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
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
                      {stagePhotos.length === 0 ? (
                        <div className="text-center text-xs text-[#22c55e]/60">
                          拖拽到此处
                        </div>
                      ) : null}
                      {stagePhotos.map((photo, index) => (
                        <SortablePhotoItem
                          key={photo.id}
                          photo={photo}
                          index={index}
                          onDelete={onDelete}
                        />
                      ))}
                    </DroppableStage>
                  </SortableContext>
                </div>
              );
            })
          : // 平常模式：只显示有照片的阶段，但按 RENOVATION_STAGES 顺序
            RENOVATION_STAGES.map((stageConfig) => {
              const stage = stageConfig.value;
              const stagePhotos = photosByStage[stage] || [];
              // 只渲染有照片的阶段
              if (stagePhotos.length === 0) return null;

              const containerId = `${CONTAINER_RENOVATION_PREFIX}${stage}`;

              return (
                <div key={stage} className="space-y-1">
                  <div className="text-xs font-medium text-[#707785] px-1 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]"></span>
                    {stageConfig.label} ({stagePhotos.length})
                  </div>
                  <SortableContext
                    items={getStageIds(stage)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      id={containerId}
                      className="space-y-2 min-h-[40px] p-1 rounded border border-dashed border-[#c0c7d6]/30 hover:border-[#22c55e]/50 transition-colors"
                    >
                      {stagePhotos.map((photo, index) => (
                        <SortablePhotoItem
                          key={photo.id}
                          photo={photo}
                          index={index}
                          onDelete={onDelete}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </div>
              );
            })}
      </div>
    </div>
  );
}
