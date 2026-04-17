"use client";

import { memo, useMemo, useCallback } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { L4MarketingMedia } from "../../types";
import { OptimizedPhotoItem } from "./optimized-photo-item";
import { usePerformanceMonitor } from "./performance-monitor";

const CONTAINER_MARKETING = "marketing";

interface MarketingPhotoListProps {
  photos: L4MarketingMedia[];
  photoIds: number[];
  onDelete: (photoId: number) => void;
}

export const MarketingPhotoList = memo(function MarketingPhotoList({
  photos,
  photoIds,
  onDelete,
}: MarketingPhotoListProps) {
  // 性能监控
  const { metrics } = usePerformanceMonitor("MarketingPhotoList", {
    enableFPS: false,
    logToConsole: false,
  });

  // 使用 useCallback 稳定 onDelete 回调，避免子组件不必要的重渲染
  const handleDelete = useCallback(
    (photoId: number) => {
      onDelete(photoId);
    },
    [onDelete]
  );

  // 使用 useMemo 缓存照片列表渲染
  const photoItems = useMemo(() => {
    return photos.map((photo, index) => (
      <OptimizedPhotoItem
        key={photo.id}
        photo={photo}
        index={index}
        onDelete={handleDelete}
      />
    ));
  }, [photos, handleDelete]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#005daa]">
          营销照片 ({photos.length})
        </h4>
        <span className="text-xs text-slate-400">可拖拽排序</span>
      </div>

      <SortableContext items={photoIds} strategy={verticalListSortingStrategy}>
        <div
          id={CONTAINER_MARKETING}
          className="space-y-2 min-h-[80px] max-h-[300px] overflow-y-auto p-2 bg-slate-50 rounded-lg border border-slate-200"
          style={{
            // 优化滚动性能
            willChange: "scroll-position",
            // 使用 GPU 加速
            transform: "translateZ(0)",
            // 减少重绘区域
            contain: "layout style paint",
          }}
        >
          {photos.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              暂无营销照片
              <p className="text-xs mt-1 text-slate-400/60">
                上传照片或从改造照片拖拽到此处
              </p>
            </div>
          ) : (
            photoItems
          )}
        </div>
      </SortableContext>
    </div>
  );
});
