"use client";

import React, { memo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFileUrl(imageUrl)}
          alt="预览"
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
      </DialogContent>
    </Dialog>
  );
});
