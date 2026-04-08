"use client";

import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { L4MarketingMedia } from "../../types";
import { SortablePhotoItem } from "./sortable-photo-item";

const CONTAINER_MARKETING = "marketing";

interface MarketingPhotoListProps {
  photos: L4MarketingMedia[];
  photoIds: number[];
  onDelete: (photoId: number) => void;
}

export function MarketingPhotoList({
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
        <span className="text-xs text-[#707785]">可拖拽到右侧</span>
      </div>

      <SortableContext items={photoIds} strategy={verticalListSortingStrategy}>
        <div
          id={CONTAINER_MARKETING}
          className="space-y-2 min-h-[100px] max-h-[400px] overflow-y-auto p-2 bg-white rounded-lg border border-[#c0c7d6]/20"
        >
          {photos.length === 0 ? (
            <div className="text-center py-8 text-[#707785] text-sm">
              暂无营销照片
              <p className="text-xs mt-1 text-[#707785]/60">
                可将改造照片拖拽到此处
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
}
