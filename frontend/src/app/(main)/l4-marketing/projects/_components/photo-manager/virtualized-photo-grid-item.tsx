"use client";

import { memo, useState, useRef, useEffect, useMemo, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { getFileUrl } from "@/lib/config";
import { Check } from "lucide-react";
import type { RenovationPhoto } from "./types";

interface VirtualizedPhotoGridItemProps {
  photo: RenovationPhoto;
  isSelected: boolean;
  isExisting: boolean;
  onToggle: () => void;
  style: CSSProperties;
}

// 懒加载图片 hook
function useLazyImage(src: string, isVisible: boolean) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!isVisible || loaded || error) return;

    const img = new Image();
    img.src = src;
    img.onload = () => setLoaded(true);
    img.onerror = () => setError(true);
    imageRef.current = img;

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, isVisible, loaded, error]);

  return { loaded, error };
}

export const VirtualizedPhotoGridItem = memo(function VirtualizedPhotoGridItem({
  photo,
  isSelected,
  isExisting,
  onToggle,
  style,
}: VirtualizedPhotoGridItemProps) {
  const [isInViewport, setIsInViewport] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  // 使用 Intersection Observer 实现懒加载
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInViewport(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px", // 提前100px开始加载
        threshold: 0.1,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const imageUrl = getFileUrl(photo.url);
  const { loaded: imageLoaded } = useLazyImage(imageUrl, isInViewport);

  // 生成缩略图URL（如果后端支持）
  const thumbnailUrl = useMemo(() => {
    // 如果URL包含图片处理参数，添加缩略图参数
    if (imageUrl.includes("?")) {
      return `${imageUrl}&w=200&q=75`;
    }
    return `${imageUrl}?w=200&q=75`;
  }, [imageUrl]);

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
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* 实际图片 - 使用img标签配合loading="lazy" */}
        {isInViewport && (
          <img
            src={thumbnailUrl}
            alt={photo.description || `Photo ${photo.id}`}
            loading="lazy"
            decoding="async"
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              imageLoaded ? "opacity-100" : "opacity-0"
            )}
            style={{
              willChange: "opacity",
            }}
          />
        )}
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
