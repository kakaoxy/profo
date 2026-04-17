"use client";

import { memo } from "react";
import { L4MarketingMedia, PHOTO_CATEGORY_CONFIG } from "../../types";
import { getOptimizedImageUrl } from "../detail/utils";
import { Badge } from "@/components/ui/badge";
import { GripVertical } from "lucide-react";
import { RENOVATION_STAGES } from "../../types";

interface PhotoDragOverlayProps {
  photo: L4MarketingMedia;
}

export const PhotoDragOverlay = memo(function PhotoDragOverlay({ photo }: PhotoDragOverlayProps) {
  const categoryConfig = PHOTO_CATEGORY_CONFIG[photo.photo_category];
  const stageLabel = RENOVATION_STAGES.find(
    (s) => s.value === photo.renovation_stage
  )?.label;

  // 使用优化的图片 URL（拖拽时使用较小的缩略图）
  const displayUrl = photo.thumbnail_url || photo.file_url;
  const optimizedUrl = getOptimizedImageUrl(displayUrl, { 
    width: 64, 
    height: 64,
    quality: 60 // 拖拽时降低质量以提高性能
  });

  return (
    <div 
      className="flex items-center gap-3 rounded-lg border-2 border-[#005daa] bg-white p-3 shadow-xl ring-2 ring-[#005daa]/20"
      style={{
        // 使用 GPU 加速
        transform: "translateZ(0)",
        willChange: "transform",
      }}
    >
      <div className="cursor-grabbing p-1 bg-[#e5eeff] rounded">
        <GripVertical className="h-4 w-4 text-[#005daa]" />
      </div>

      <div
        className="w-16 h-16 rounded-md bg-slate-100 border shrink-0 relative overflow-hidden"
      >
        {optimizedUrl && (
          <img
            src={optimizedUrl}
            alt={`照片 #${photo.id}`}
            className="w-full h-full object-cover"
            width={64}
            height={64}
            decoding="async"
          />
        )}
        <Badge
          className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[10px] pointer-events-none"
          style={{
            backgroundColor: categoryConfig.bgColor,
            color: categoryConfig.color,
            borderColor: categoryConfig.color,
          }}
          variant="outline"
        >
          {categoryConfig.label}
        </Badge>
      </div>

      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-xs font-medium text-[#0b1c30] truncate">
          照片 #{photo.id}
        </p>
        {photo.photo_category === "renovation" && stageLabel && (
          <p className="text-xs text-[#707785] truncate">{stageLabel}</p>
        )}
      </div>
    </div>
  );
});
