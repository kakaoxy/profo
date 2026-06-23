"use client";

import { useRef, useCallback, useMemo, memo, useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { VirtualizedPhotoGridItem } from "./virtualized-photo-grid-item";
import type { RenovationPhoto } from "./types";

interface VirtualizedPhotoGridProps {
  photos: RenovationPhoto[];
  loading: boolean;
  existingPhotoUrls: Set<string>;
  selectedIds: Set<number | string>;
  onTogglePhoto: (photoId: number | string) => void;
}

// 网格配置
const GRID_CONFIG = {
  rowHeight: 180, // 每行高度（像素）
  gap: 16, // 网格间距
  overscan: 3, // 预渲染行数
  minColumnWidth: 140, // 最小列宽
};

export const VirtualizedPhotoGrid = memo(function VirtualizedPhotoGrid({
  photos,
  loading,
  existingPhotoUrls,
  selectedIds,
  onTogglePhoto,
}: VirtualizedPhotoGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const [scrollTop, setScrollTop] = useState(0);

  // 计算列数
  const columnCount = useMemo(() => {
    if (containerWidth === 0) return 5;
    return Math.max(
      2,
      Math.floor(containerWidth / (GRID_CONFIG.minColumnWidth + GRID_CONFIG.gap))
    );
  }, [containerWidth]);

  // 计算行数（简单计算，无需 useMemo）
  const rowCount = Math.ceil(photos.length / columnCount);

  // 计算总高度（简单计算，无需 useMemo）
  const totalHeight = rowCount * (GRID_CONFIG.rowHeight + GRID_CONFIG.gap);

  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width - 48); // 减去padding
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);
    setContainerWidth(containerRef.current.clientWidth - 48);
    setContainerHeight(containerRef.current.clientHeight);

    return () => resizeObserver.disconnect();
  }, []);

  // 使用 useMemo 计算可见范围，避免在 effect 中调用 setState
  const visibleRange = useMemo(() => {
    const startRow = Math.max(0, Math.floor(scrollTop / (GRID_CONFIG.rowHeight + GRID_CONFIG.gap)) - GRID_CONFIG.overscan);
    const visibleRowCount = Math.ceil(containerHeight / (GRID_CONFIG.rowHeight + GRID_CONFIG.gap));
    const endRow = Math.min(rowCount, startRow + visibleRowCount + GRID_CONFIG.overscan * 2);

    return {
      start: startRow * columnCount,
      end: Math.min(photos.length, endRow * columnCount),
    };
  }, [scrollTop, rowCount, columnCount, photos.length, containerHeight]);

  // 滚动处理 - 使用requestAnimationFrame节流
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const targetScrollTop = e.currentTarget.scrollTop;

    requestAnimationFrame(() => {
      setScrollTop(targetScrollTop);
    });
  }, []);

  // 获取指定索引的照片
  const getPhotoAtIndex = useCallback((index: number): RenovationPhoto | undefined => {
    return photos[index];
  }, [photos]);

  // 渲染可见的网格项
  const visibleItems = useMemo(() => {
    const items: React.ReactElement[] = [];

    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const photo = getPhotoAtIndex(i);
      if (!photo) continue;

      const rowIndex = Math.floor(i / columnCount);
      const colIndex = i % columnCount;

      items.push(
        <VirtualizedPhotoGridItem
          key={photo.id}
          photo={photo}
          isSelected={selectedIds.has(photo.id)}
          isExisting={existingPhotoUrls.has(photo.url)}
          onToggle={() => onTogglePhoto(photo.id)}
          style={{
            position: "absolute",
            top: rowIndex * (GRID_CONFIG.rowHeight + GRID_CONFIG.gap),
            left: colIndex * (containerWidth / columnCount + GRID_CONFIG.gap / columnCount),
            width: containerWidth / columnCount - GRID_CONFIG.gap,
            height: GRID_CONFIG.rowHeight,
          }}
        />
      );
    }

    return items;
  }, [visibleRange, getPhotoAtIndex, columnCount, selectedIds, existingPhotoUrls, onTogglePhoto, containerWidth]);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6" ref={containerRef}>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6" ref={containerRef}>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          暂无照片
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-6"
      onScroll={handleScroll}
      style={{ willChange: "scroll-position" }}
    >
      <div
        style={{
          position: "relative",
          height: totalHeight,
          width: "100%",
        }}
      >
        {visibleItems}
      </div>
    </div>
  );
});
