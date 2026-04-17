"use client";

import { memo } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileUrl } from "./utils";
import type { ImagePreviewDialogProps } from "./types";

// 使用 memo 避免不必要的重渲染
export const ImagePreviewDialog = memo(function ImagePreviewDialog({
  imageUrl,
  onClose
}: ImagePreviewDialogProps) {
  if (!imageUrl) return null;

  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-none bg-transparent shadow-none p-0">
        <DialogTitle className="sr-only">
          图片预览
        </DialogTitle>
        <div className="relative w-full h-[80vh]">
          <Image
            src={getFileUrl(imageUrl)}
            alt="预览"
            fill
            className="object-contain rounded-lg shadow-2xl"
            sizes="(max-width: 896px) 100vw, 896px"
            priority
          />
        </div>
      </DialogContent>
    </Dialog>
  );
});
