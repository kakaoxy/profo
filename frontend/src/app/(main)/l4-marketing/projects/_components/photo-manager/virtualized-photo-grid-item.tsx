"use client";

import { memo, useMemo, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useElementVisibility, useSimpleImageLoader } from "../common/hooks";
import { getOptimizedImageUrl } from "../common/utils";
import type { RenovationPhoto } from "./types";

interface VirtualizedPhotoGridItemProps {
  photo: RenovationPhoto;
  isSelected: boolean;
  isExisting: boolean;
  onToggle: () => void;
  style: CSSProperties;
}

/**
 * 虚拟化照片网格项组件
 * 使用共享的懒加载 Hooks 和工具函数
 */
export const VirtualizedPhotoGridItem = memo(function VirtualizedPhotoGridItem({
  photo,
  isSelected,
  isExisting,
  onToggle,
  style,
}: VirtualizedPhotoGridItemProps) {
  // 使用共享的元素视口检测 Hook
  const { ref: elementRef, isVisible: isInViewport } = useElementVisibility<HTMLDivElement>();

  // 使用优化的图片 URL
  const imageUrl = photo.url;
  const thumbnailUrl = useMemo(() => {
    return getOptimizedImageUrl(imageUrl, { width: 200, height: 200, quality: 75 });
  }, [imageUrl]);

  // 使用共享的图片加载 Hook
  const { status: imageStatus } = useSimpleImageLoader(
    isInViewport ? thumbnailUrl : null
  );

  return (
    <div
      ref={elementRef}
      className={cn(
        "relative p-2 rounded-xl border-2 cursor-pointer transition-all",
        isSelected
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/50",
        isExisting && "opacity-50"
      )}
      style={style}
      onClick={() => !isExisting && onToggle()}
    >
      {/* 选中状态指示器 */}
      {isSelected ? (
        <div className="absolute top-3 right-3 z-10 bg-primary text-white rounded-full p-0.5">
          <Check className="w-3 h-3" />
        </div>
      ) : null}

      {/* 未选中状态指示器 */}
      {!isSelected && !isExisting ? (
        <div className="absolute top-3 right-3 z-10 w-5 h-5 border-2 border-border bg-white/80 rounded-full" />
      ) : null}

      {/* 已添加状态指示器 */}
      {isExisting ? (
        <div className="absolute top-3 right-3 z-10 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
          已添加
        </div>
      ) : null}

      {/* 图片容器 */}
      <div
        className="w-full aspect-square rounded-lg bg-center mb-2 overflow-hidden relative"
        style={{
          backgroundColor: "#f3f4f6",
        }}
      >
        {/* 占位符/加载状态 */}
        {imageStatus !== "loaded" ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        ) : null}

        {/* 实际图片 - 使用img标签配合loading="lazy" */}
        {isInViewport ? (
          <img
            src={thumbnailUrl}
            alt={photo.description || `Photo ${photo.id}`}
            loading="lazy"
            decoding="async"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              imageStatus === "loaded" ? "opacity-100" : "opacity-0"
            )}
            style={{
              willChange: "opacity",
            }}
          />
        ) : null}
      </div>

      {/* 信息区域 */}
      <div className="px-1">
        <p className="text-xs font-bold truncate">
          ID: #{photo.id}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {photo.description || photo.stage}
        </p>
      </div>
    </div>
  );
});
