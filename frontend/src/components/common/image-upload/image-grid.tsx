"use client";

import { memo } from "react";
import { cn } from "@/lib/utils";
import type { ImageItem } from "./types";
import { ImageItemView } from "./image-item";

interface ImageGridProps {
  items: ImageItem[];
  aspectRatio: string;
  gridCols: number;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPreview: (item: ImageItem) => void;
}

const gridColsClasses: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
};

export const ImageGrid = memo(function ImageGrid({
  items,
  aspectRatio,
  gridCols,
  onRemove,
  onRetry,
  onPreview,
}: ImageGridProps) {
  const colsClass = gridColsClasses[gridCols] || gridColsClasses[3];

  return (
    <div className={cn("grid gap-3", colsClass)}>
      {items.map((item) => (
        <ImageItemView
          key={item.id}
          item={item}
          aspectRatio={aspectRatio}
          onRemove={onRemove}
          onRetry={onRetry}
          onPreview={onPreview}
        />
      ))}
    </div>
  );
});
