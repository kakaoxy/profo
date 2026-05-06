"use client";

import { useState, useCallback } from "react";
import { useImageUpload } from "./use-image-upload";
import { UploadArea } from "./upload-area";
import { ImageGrid } from "./image-grid";
import { ImagePreview } from "./image-preview";
import { cn } from "@/lib/utils";
import { DEFAULT_ALLOWED_IMAGE_TYPES, DEFAULT_MAX_FILE_SIZE } from "@/components/common/upload";
import type { ImageItem, ImageUploadProps } from "./types";

export function ImageUpload({
  defaultValue,
  onChange,
  maxCount,
  maxSize = DEFAULT_MAX_FILE_SIZE,
  allowedTypes = DEFAULT_ALLOWED_IMAGE_TYPES,
  maxConcurrency = 3,
  disabled = false,
  title = "点击或拖拽图片到此处上传",
  description,
  className,
  gridCols = 3,
  aspectRatio = "aspect-square",
  onUploadSuccess,
  onUploadError,
  children,
  showUploadArea = true,
}: ImageUploadProps) {
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const {
    items,
    isUploading,
    upload,
    remove,
    retry,
  } = useImageUpload({
    defaultValue,
    maxCount,
    maxSize,
    allowedTypes,
    maxConcurrency,
    onUploadSuccess: (item) => {
      onUploadSuccess?.(item);
    },
    onUploadError: (item) => {
      onUploadError?.(item);
    },
    onChange,
  });

  const handlePreview = useCallback((item: ImageItem) => {
    setPreviewItem(item);
    setPreviewOpen(true);
  }, []);

  const acceptStr = allowedTypes.join(",");

  const defaultDescription =
    description ??
    `支持 JPG, PNG, GIF, WebP，单文件最大 ${Math.round(maxSize / 1024 / 1024)}MB`;

  const hasMoreSlots = !maxCount || items.length < maxCount;

  return (
    <div className={cn("space-y-4", className)}>
      {children}

      {showUploadArea && hasMoreSlots && (
        <UploadArea
          isUploading={isUploading}
          disabled={disabled || !hasMoreSlots}
          title={title}
          description={defaultDescription}
          accept={acceptStr}
          multiple
          onUpload={upload}
        />
      )}

      {items.length > 0 && (
        <ImageGrid
          items={items}
          aspectRatio={aspectRatio}
          gridCols={gridCols}
          onRemove={remove}
          onRetry={retry}
          onPreview={handlePreview}
        />
      )}

      <ImagePreview
        item={previewItem}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}

export default ImageUpload;
