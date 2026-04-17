"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
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
  const { isOver, setNodeRef } = useDroppable({
    id: CONTAINER_MARKETING,
    data: {
      type: "stage",
      stage: "marketing",
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#005daa]">
          营销照片 ({photos.length})
        </h4>
        <span className="text-xs text-[#707785]">可拖拽到右侧</span>
      </div>

      <div
        ref={setNodeRef}
        id={CONTAINER_MARKETING}
        data-droppable="true"
        className={cn(
          "rounded border-2 border-dashed transition-all min-h-[100px] p-3",
          isOver
            ? "border-[#005daa] bg-[#eff4ff] ring-2 ring-[#005daa]/20"
            : "border-[#005daa]/30 bg-[#eff4ff]/30"
        )}
      >
        <SortableContext items={photoIds} strategy={verticalListSortingStrategy}>
          {photos.length === 0 ? (
            <div className="flex items-center justify-center h-full py-8">
              <div className="text-center text-[#707785] text-sm pointer-events-none">
                暂无营销照片
                <p className="text-xs mt-1 text-[#707785]/60">
                  可将改造照片拖拽到此处
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {photos.map((photo, index) => (
                <SortablePhotoItem
                  key={photo.id}
                  photo={photo}
                  index={index}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </SortableContext>
      </div>
    </div>
  );
}
