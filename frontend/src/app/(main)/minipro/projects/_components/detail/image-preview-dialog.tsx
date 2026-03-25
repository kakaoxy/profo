"use client";

import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImagePreviewDialogProps } from "./types";

export function ImagePreviewDialog({ imageUrl, onClose }: ImagePreviewDialogProps) {
  return (
    <Dialog open={!!imageUrl} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>图片预览</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center py-4 relative w-full h-[75vh]">
          {imageUrl && (
            <Image
              src={imageUrl}
              alt="预览"
              fill
              className="object-contain rounded-lg"
              sizes="(max-width: 896px) 100vw, 896px"
              priority
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
