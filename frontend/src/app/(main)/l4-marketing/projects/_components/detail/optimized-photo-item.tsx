"use client";

import { memo, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { L4MarketingMedia, PHOTO_CATEGORY_CONFIG, RENOVATION_STAGES } from "../../types";
import { BasePhotoItem } from "../common/components";
import type { CategoryConfig, PhotoItemData } from "../common/components";

interface OptimizedPhotoItemProps {
  photo: L4MarketingMedia;
  index: number;
  onDelete: (photoId: number) => void;
}

/**
 * 优化版照片列表项组件
 * 基于 BasePhotoItem 封装，适配 L4MarketingMedia 类型
 * 使用共享的懒加载和性能优化逻辑
 */
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

  // 转换分类配置
  const categoryConfig: CategoryConfig = {
    label: PHOTO_CATEGORY_CONFIG[photo.photo_category].label,
    color: PHOTO_CATEGORY_CONFIG[photo.photo_category].color,
    bgColor: PHOTO_CATEGORY_CONFIG[photo.photo_category].bgColor,
  };

  // 获取阶段标签
  const stageLabel = photo.photo_category === "renovation"
    ? RENOVATION_STAGES.find((s) => s.value === photo.renovation_stage)?.label
    : undefined;

  // 转换照片数据格式
  const photoData: PhotoItemData = {
    id: photo.id,
    url: photo.thumbnail_url || photo.file_url || "",
    description: photo.description,
    category: photo.photo_category,
    stage: photo.renovation_stage,
  };

  // 处理删除
  const handleDelete = useCallback((photoId: number | string) => {
    onDelete(Number(photoId));
  }, [onDelete]);

  return (
    <BasePhotoItem
      photo={photoData}
      index={index}
      isDragging={isDragging}
      transformStyle={style}
      categoryConfig={categoryConfig}
      stageLabel={stageLabel}
      showDelete={true}
      showDragHandle={true}
      showCategoryBadge={true}
      showIndexBadge={true}
      imageSize={64}
      onDelete={handleDelete}
      dragAttributes={attributes}
      dragListeners={listeners}
      setNodeRef={setNodeRef}
      className="hover:bg-[#f8faff] [&_button]:hover:bg-[#e5eeff]"
    />
  );
});
