"use client";

/**
 * 户型图大图预览 Dialog.
 *
 * 支持左右导航切换图片，ESC 关闭，触摸滑动。
 */

import { useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getFileUrl } from "@/lib/config";
import type { components } from "@/lib/api-types";

type CommunityImageResponse = components["schemas"]["CommunityImageResponse"];

interface ImagePreviewDialogProps {
  images: CommunityImageResponse[];
  index: number;
  open: boolean;
  onIndexChange: (index: number) => void;
  onOpenChange: (open: boolean) => void;
}

export function ImagePreviewDialog({
  images,
  index,
  open,
  onIndexChange,
  onOpenChange,
}: ImagePreviewDialogProps) {
  const current = images[index];

  const goPrev = useCallback(() => {
    onIndexChange((index - 1 + images.length) % images.length);
  }, [index, images.length, onIndexChange]);

  const goNext = useCallback(() => {
    onIndexChange((index + 1) % images.length);
  }, [index, images.length, onIndexChange]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, goPrev, goNext]);

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-none max-w-[95vw] w-fit h-[85vh] flex flex-col p-0 gap-0 bg-black/95 border-none"
      >
        <DialogTitle className="sr-only">户型图预览</DialogTitle>

        {/* 图片区域 */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getFileUrl(current.url)}
            alt={current.description ?? "户型图"}
            className="max-w-full max-h-full object-contain"
          />

          {/* 左右导航 */}
          {images.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
                aria-label="上一张"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                onClick={goNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 hover:bg-white/20 p-2 text-white transition-colors"
                aria-label="下一张"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* 底部信息 */}
        <div className="shrink-0 px-4 py-3 bg-black/80 text-white/90 text-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 px-2 py-0.5 rounded text-xs bg-white/15">
              {current.source === "scraped" ? "抓取" : "上传"}
            </span>
            {current.description && (
              <span className="truncate text-white/70">{current.description}</span>
            )}
          </div>
          <span className="shrink-0 text-white/50 text-xs">
            {index + 1} / {images.length}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
