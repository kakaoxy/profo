"use client";

import { memo } from "react";
import Image from "next/image";
import { Trash2, RefreshCw, Eye, Loader2, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { ImageItem } from "./types";

interface ImageItemViewProps {
  item: ImageItem;
  aspectRatio: string;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onPreview: (item: ImageItem) => void;
}

export const ImageItemView = memo(function ImageItemView({
  item,
  aspectRatio,
  onRemove,
  onRetry,
  onPreview,
}: ImageItemViewProps) {
  const isImageUrl = item.url && !item.url.startsWith("blob:");
  const displayUrl = item.objectUrl || item.url;

  return (
    <div
      className={cn(
        "relative rounded-md overflow-hidden border shadow-sm group",
        aspectRatio,
        item.status === "error" && "border-error/40 ring-1 ring-error/20",
        item.status === "uploading" && "border-primary/30"
      )}
    >
      {displayUrl && (
        <Image
          src={displayUrl}
          alt="uploaded"
          fill
          className={cn(
            "object-cover transition-transform group-hover:scale-105",
            item.status === "uploading" && "opacity-60 blur-[1px]",
            item.status === "error" && "opacity-70"
          )}
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          unoptimized={!isImageUrl}
        />
      )}

      {/* Uploading overlay */}
      {item.status === "uploading" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 z-10 p-2 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow-md" />
          <div className="w-full px-2">
            <Progress value={item.progress} className="h-1.5 w-full bg-card/40" />
          </div>
          <span className="text-[10px] text-white font-medium drop-shadow-md">
            {item.progress}%
          </span>
        </div>
      ) : null}

      {/* Error overlay */}
      {item.status === "error" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 z-10 p-2 gap-1.5">
          <AlertCircle className="h-5 w-5 text-error drop-shadow-md" />
          <span className="text-[10px] text-white font-medium drop-shadow-md text-center line-clamp-2 px-1">
            {item.error || "上传失败"}
          </span>
        </div>
      ) : null}

      {/* Success / hover state actions */}
      {item.status !== "uploading" ? (
        <>
          {/* Preview button on hover */}
          {item.status === "success" ? (
            <button
              onClick={() => onPreview(item)}
              className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"
              aria-label="预览"
            >
              <Eye className="text-white opacity-0 group-hover:opacity-100 w-6 h-6 drop-shadow-md transition-opacity" />
            </button>
          ) : null}

          {/* Action buttons */}
          <div className="absolute top-1.5 right-1.5 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.status === "error" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRetry(item.id);
                }}
                className="bg-card/90 p-1.5 rounded-full text-primary hover:bg-primary/20 shadow-sm transition-colors"
                title="重试"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(item.id);
              }}
              className="bg-card/90 p-1.5 rounded-full text-error hover:bg-error/10 shadow-sm transition-colors"
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
});
