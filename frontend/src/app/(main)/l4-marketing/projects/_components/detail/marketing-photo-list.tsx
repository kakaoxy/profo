"use client";

import { memo } from "react";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { L4MarketingMedia } from "../../types";
import { SortablePhotoItem } from "../photo-manager/sortable-photo-item";

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
        >
          {photos.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              暂无营销照片
              <p className="text-xs mt-1 text-slate-400/60">
                上传照片或从改造照片拖拽到此处
              </p>
            </div>
          ) : (
            photos.map((photo, index) => (
              <SortablePhotoItem
                key={photo.id}
                photo={photo}
                index={index}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
});
