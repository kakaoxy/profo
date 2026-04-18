"use client";

import { useState, memo } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RenovationPhoto } from "../../../../../types";
import { getFileUrl } from "../../../utils";
import { cn } from "@/lib/utils";
import { LazyPhoto } from "./lazy-photo";

interface StagePhotoItemProps {
  photo: RenovationPhoto;
  stageLabel: string;
  photoCount: number;
  allPhotos: RenovationPhoto[];
}

export const StagePhotoItem = memo(function StagePhotoItem({
  photo,
  stageLabel,
  photoCount,
  allPhotos,
}: StagePhotoItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <div className="flex-none w-[200px] group">
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <div className="relative rounded-xl overflow-hidden shadow-sm transition-all hover:shadow-md cursor-zoom-in ring-1 ring-slate-100">
            <AspectRatio ratio={4 / 3} className="relative">
              <Image
                src={getFileUrl(photo.url)}
                alt={stageLabel}
                fill
                sizes="200px"
                loading="lazy"
                unoptimized
                onLoad={() => setImageLoaded(true)}
                className={cn(
                  "object-cover transition-all duration-500 group-hover:scale-110",
                  imageLoaded ? "opacity-100" : "opacity-0 bg-slate-100"
                )}
              />
              {!imageLoaded && (
                <div className="absolute inset-0 bg-slate-100 animate-pulse" />
              )}
            </AspectRatio>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
              <Badge className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-[10px] border-0 h-5">
                {photoCount} 张
              </Badge>
            </div>
          </div>
        </DialogTrigger>
        <DialogContent className="max-w-4xl p-0 bg-black/90 border-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>{stageLabel} 影像记录</DialogTitle>
            <DialogDescription>
              正在查看 {stageLabel} 阶段的照片背景。
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[80vh]">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {allPhotos.map((p, i) => (
                <LazyPhoto key={p.id} photo={p} index={i} />
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
});
