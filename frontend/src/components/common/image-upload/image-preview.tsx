"use client";

import Image from "next/image";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import type { ImageItem } from "./types";

interface ImagePreviewProps {
  item?: ImageItem | null;
  imageUrl?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImagePreview({ item, imageUrl, open, onOpenChange }: ImagePreviewProps) {
  const displayUrl = imageUrl || item?.response?.url || item?.url;

  if (!displayUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl border-none bg-transparent shadow-none p-0">
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <DialogClose className="absolute top-2 right-2 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70">
          <X className="h-4 w-4" />
        </DialogClose>
        <div className="relative w-full aspect-video">
          <Image
            src={displayUrl}
            alt="预览"
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            unoptimized
            className="object-contain rounded-lg shadow-2xl"
            priority
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
