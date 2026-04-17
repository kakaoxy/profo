"use client";

import { memo, useCallback, CSSProperties } from "react";
import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical, Loader2 } from "lucide-react";
import { useElementVisibility, useSimpleImageLoader } from "../hooks";
import { getOptimizedImageUrl } from "../utils";
import type { ImageLoadStatus } from "../hooks";

// 照片数据接口（通用）
export interface PhotoItemData {
  id: number | string;
  url: string;
  description?: string | null;
  category?: string;
  stage?: string | null;
}

// 分类配置接口
export interface CategoryConfig {
  label: string;
  color: string;
  bgColor: string;
}

// BasePhotoItem 组件属性
export interface BasePhotoItemProps {
  /** 照片数据 */
  photo: PhotoItemData;
  /** 索引号（用于显示 #1, #2 等） */
  index: number;
  /** 是否处于拖拽中 */
  isDragging?: boolean;
  /** 拖拽相关的 transform 样式 */
  transformStyle?: CSSProperties;
  /** 分类配置（用于显示徽章） */
  categoryConfig?: CategoryConfig;
  /** 阶段标签 */
  stageLabel?: string;
  /** 是否显示删除按钮 */
  showDelete?: boolean;
  /** 是否显示拖拽手柄 */
  showDragHandle?: boolean;
  /** 是否显示分类徽章 */
  showCategoryBadge?: boolean;
  /** 是否显示序号徽章 */
  showIndexBadge?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 图片尺寸 */
  imageSize?: number;
  /** 删除回调 */
  onDelete?: (photoId: number | string) => void;
  /** 点击回调 */
  onClick?: (photo: PhotoItemData) => void;
  /** 拖拽属性（来自 dnd-kit） */
  dragAttributes?: DraggableAttributes;
  /** 拖拽监听器（来自 dnd-kit） */
  dragListeners?: SyntheticListenerMap;
  /** 设置节点 ref（来自 dnd-kit） */
  setNodeRef?: (node: HTMLElement | null) => void;
}

/**
 * 通用照片列表项组件
 * 合并了 OptimizedPhotoItem 和 SortablePhotoItem 的功能
 * 特性：
 * 1. 支持懒加载
 * 2. 支持拖拽
 * 3. 支持分类徽章
 * 4. 支持删除操作
 * 5. 可配置显示元素
 */
export const BasePhotoItem = memo(function BasePhotoItem({
  photo,
  index,
  isDragging = false,
  transformStyle,
  categoryConfig,
  stageLabel,
  showDelete = true,
  showDragHandle = true,
  showCategoryBadge = true,
  showIndexBadge = true,
  className,
  imageSize = 64,
  onDelete,
  onClick,
  dragAttributes,
  dragListeners,
  setNodeRef,
}: BasePhotoItemProps) {
  // 使用元素级别的视口检测
  const { ref: imageContainerRef, isVisible } = useElementVisibility<HTMLDivElement>();

  // 使用优化的图片 URL
  const optimizedUrl = getOptimizedImageUrl(photo.url, {
    width: imageSize,
    height: imageSize,
    quality: 80,
  });

  // 图片加载状态
  const { status: imageStatus } = useSimpleImageLoader(
    isVisible ? optimizedUrl : null
  );

  // 处理删除
  const handleDelete = useCallback(() => {
    onDelete?.(photo.id);
  }, [onDelete, photo.id]);

  // 处理点击
  const handleClick = useCallback(() => {
    onClick?.(photo);
  }, [onClick, photo]);

  return (
    <div
      ref={setNodeRef}
      style={transformStyle}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white p-3",
        "hover:bg-slate-50 transition-colors",
        isDragging && "shadow-lg ring-2 ring-primary opacity-90",
        className
      )}
    >
      {/* 拖拽手柄 */}
      {showDragHandle && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-slate-100 rounded flex-shrink-0"
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical className="h-4 w-4 text-slate-400" />
        </button>
      )}

      {/* 图片容器 - 使用懒加载 */}
      <div
        ref={imageContainerRef}
        className="rounded-md bg-slate-100 border shrink-0 relative overflow-hidden"
        style={{ width: imageSize, height: imageSize }}
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
                alt={photo.description || `照片 #${photo.id}`}
                className={cn(
                  "w-full h-full object-cover transition-opacity duration-300",
                  imageStatus === "loaded" ? "opacity-100" : "opacity-0"
                )}
                loading="lazy"
                decoding="async"
                width={imageSize}
                height={imageSize}
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
        {!isVisible && <div className="absolute inset-0 bg-slate-100" />}

        {/* 分类徽章 */}
        {showCategoryBadge && categoryConfig && (
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
        )}
      </div>

      {/* 信息区域 */}
      <div className="flex-1 min-w-0 overflow-hidden" onClick={handleClick}>
        <p className="text-xs font-medium text-slate-900 truncate">
          照片 #{photo.id}
        </p>
        {stageLabel && (
          <p className="text-xs text-slate-500 truncate">{stageLabel}</p>
        )}
      </div>

      {/* 序号徽章 */}
      {showIndexBadge && (
        <Badge
          variant="outline"
          className="rounded-md border-slate-200 text-slate-500 flex-shrink-0"
        >
          #{index + 1}
        </Badge>
      )}

      {/* 删除按钮 */}
      {showDelete && onDelete && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-red-600 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
          onClick={handleDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
});

// 导出类型
export type { ImageLoadStatus };
