"use client";

import { memo, useState, useRef, useEffect, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { L4MarketingMedia, PHOTO_CATEGORY_CONFIG } from "../../types";
import { getOptimizedImageUrl } from "./utils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical, Loader2 } from "lucide-react";
import { RENOVATION_STAGES } from "../../types";

interface OptimizedPhotoItemProps {
  photo: L4MarketingMedia;
  index: number;
  onDelete: (photoId: number) => void;
}

// 使用 Intersection Observer 实现懒加载
function useLazyLoad<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px",
        threshold: 0.1,
      }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, isVisible };
}

// 图片加载状态管理
function useImageLoader(src: string | undefined) {
  const [status, setStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [loadTime, setLoadTime] = useState<number>(0);
  // 使用 ref 跟踪加载是否已完成，避免超时后覆盖成功状态
  const isCompleteRef = useRef(false);

  useEffect(() => {
    if (!src) {
      setStatus("error");
      return;
    }

    // 重置完成标记
    isCompleteRef.current = false;
    setStatus("loading");
    const startTime = performance.now();

    const img = new Image();
    img.src = src;

    img.onload = () => {
      isCompleteRef.current = true;
      setStatus("loaded");
      setLoadTime(Math.round(performance.now() - startTime));
    };

    img.onerror = () => {
      isCompleteRef.current = true;
      setStatus("error");
    };

    // 超时处理
    const timeout = setTimeout(() => {
      if (!isCompleteRef.current) {
        setStatus("error");
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [src]);

  return { status, loadTime };
}

export const OptimizedPhotoItem = memo(function OptimizedPhotoItem({
  photo,
  index,
  onDelete,
}: OptimizedPhotoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: photo.id,
    data: {
      photo,
      type: "photo",
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? transition : undefined,
    zIndex: isDragging ? 50 : "auto" as const,
  };

  const categoryConfig = PHOTO_CATEGORY_CONFIG[photo.photo_category];
  const stageLabel = RENOVATION_STAGES.find(
    (s) => s.value === photo.renovation_stage
  )?.label;

  // 使用缩略图 URL，如果没有则使用原图
  const thumbnailUrl = photo.thumbnail_url || photo.file_url;
  
  // 使用优化的图片 URL（添加尺寸参数）
  const optimizedUrl = getOptimizedImageUrl(thumbnailUrl, { width: 128, height: 128 });

  // 懒加载
  const { ref: imageContainerRef, isVisible } = useLazyLoad<HTMLDivElement>();
  
  // 图片加载状态
  const { status: imageStatus } = useImageLoader(isVisible ? optimizedUrl : undefined);

  // 性能监控 - 记录渲染时间
  const renderStartTime = useRef<number>(0);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      const renderTime = performance.now() - renderStartTime.current;
      if (renderTime > 16) {
        console.warn(`[Performance] PhotoItem ${photo.id} render took ${renderTime.toFixed(2)}ms`);
      }
    }
  });
  renderStartTime.current = performance.now();

  const handleDelete = useCallback(() => {
    onDelete(photo.id);
  }, [onDelete, photo.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white p-3",
        "hover:bg-[#f8faff] transition-colors",
        isDragging && "shadow-lg ring-2 ring-[#005daa] opacity-90"
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-[#e5eeff] rounded flex-shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-[#707785]" />
      </button>

      {/* 图片容器 - 使用懒加载 */}
      <div
        ref={imageContainerRef}
        className="w-16 h-16 rounded-md bg-slate-100 border shrink-0 relative overflow-hidden"
      >
        {isVisible && (
          <>
            {/* 加载状态 */}
            {imageStatus === "loading" && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              </div>
            )}
            
            {/* 实际图片 */}
            {optimizedUrl && (
              <img
                src={optimizedUrl}
                alt={`照片 #${photo.id}`}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-300",
                  imageStatus === "loaded" ? "opacity-100" : "opacity-0"
                )}
                loading="lazy"
                decoding="async"
                width={64}
                height={64}
              />
            )}
            
            {/* 错误状态 */}
            {imageStatus === "error" && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                加载失败
              </div>
            )}
          </>
        )}
        
        {/* 占位符 - 未进入视口时显示 */}
        {!isVisible && (
          <div className="absolute inset-0 bg-slate-100" />
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

      <Badge 
        variant="outline" 
        className="rounded-md border-[#c0c7d6]/50 text-[#707785] flex-shrink-0"
      >
        #{index + 1}
      </Badge>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-[#ba1a1a] hover:text-[#ba1a1a] hover:bg-red-50 flex-shrink-0"
        onClick={handleDelete}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
});
