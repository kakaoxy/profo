"use client";

import { useState, memo } from "react";
import Image from "next/image";
import { UploadCloud, Loader2, Trash2, Eye, ImageIcon, Download } from "lucide-react";
import { RenovationPhoto } from "../../../../../types";
import { getThumbnailUrl, getFileUrl } from "../../../utils";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isValidUrl } from "@/lib/validators";
import { downloadFile } from "@/lib/file-utils";

// [New] Define the structure for a photo currently being uploaded
export interface UploadingPhoto {
  id: string; // Temporary ID
  file: File; // Raw file object
  previewUrl: string; // Local Blob URL
  progress: number; // 0-100
  status: "uploading" | "error";
}

interface PhotoGridProps {
  photos: RenovationPhoto[];
  uploadingPhotos?: UploadingPhoto[];
  isLoading: boolean;
  canEditRenovation: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (photoId: string) => void;
}

// [优化] 使用 memo 缓存照片项组件，避免不必要的重渲染
interface PhotoItemProps {
  photo: RenovationPhoto;
  canEditRenovation: boolean;
  onDelete: (photoId: string) => void;
}

/** 照片瓦片尺寸（设计稿 .ph：92×70 / 圆角 12px / 内侧细描边） */
const TILE_CLASS =
  "relative h-[70px] w-[92px] shrink-0 overflow-hidden rounded-[12px] bg-muted shadow-[inset_0_0_0_1px_rgba(23,25,28,0.06)]";

const PhotoItem = memo(function PhotoItem({ photo, canEditRenovation, onDelete }: PhotoItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  // 网格缩略图和大图预览统一使用缩略图（800px WebP），避免加载原图导致卡顿
  const displayUrl = getThumbnailUrl(photo.thumbnail_url, photo.url);

  return (
    <Dialog>
      <div className={cn(TILE_CLASS, "group")}>
        {isValidUrl(displayUrl) ? (
          <Image
            src={displayUrl}
            alt={photo.filename || "Renovation Photo"}
            fill
            sizes="92px"
            loading="lazy"
            unoptimized
            onLoad={() => setImageLoaded(true)}
            className={cn(
              "object-cover transition-all duration-500 hover:scale-105",
              imageLoaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        {!imageLoaded && isValidUrl(displayUrl) && (
          <div className="absolute inset-0 animate-pulse bg-muted" />
        )}

        {/* Hover Mask */}
        <DialogTrigger asChild>
          <div className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
            <Eye className="h-6 w-6 text-white opacity-0 drop-shadow-md group-hover:opacity-100" />
          </div>
        </DialogTrigger>

        {/* Delete Button */}
        {canEditRenovation && (
          <div
            className="absolute right-1 top-1 z-20 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="rounded-full bg-card/90 p-1.5 text-error shadow-sm transition-colors hover:bg-error-container hover:text-error"
                  title="Delete Photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure you want to delete this photo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will delete the photo record. If physical deletion is configured,
                    the file will also be removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(photo.id)}
                    className="bg-error hover:bg-red-700"
                  >
                    Confirm Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* Large Preview Modal */}
      <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none">
        <DialogTitle className="sr-only">
          Photo Preview - {photo.filename || "Untitled"}
        </DialogTitle>
        <div className="relative aspect-video w-full">
          {isValidUrl(displayUrl) ? (
            <Image
              src={displayUrl}
              alt="Large Preview"
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              unoptimized
              className="rounded-lg object-contain shadow-2xl"
              priority
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted">
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </div>
        {isValidUrl(getFileUrl(photo.url)) && (
          <div className="flex justify-center pt-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-card/90 backdrop-blur-sm"
              onClick={() => downloadFile(getFileUrl(photo.url), photo.filename ?? "")}
            >
              <Download className="mr-1.5 h-4 w-4" />
              下载原图
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});
PhotoItem.displayName = "PhotoItem";

// [优化] 使用 memo 缓存上传中照片项组件
const UploadingItem = memo(function UploadingItem({ item }: { item: UploadingPhoto }) {
  return (
    <div className={cn(TILE_CLASS)}>
      {/* Local Preview Image */}
      <Image
        src={item.previewUrl}
        alt="Uploading..."
        fill
        sizes="92px"
        unoptimized
        className="object-cover opacity-60 blur-[1px] transition-all"
      />

      {/* Progress Overlay */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/10 p-2">
        {item.status === "error" ? (
          <span className="rounded bg-error/90 px-2 py-1 text-xs font-medium text-white">
            Upload Failed
          </span>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow-md" />
            <div className="w-full px-2">
              <Progress value={item.progress} className="h-1.5 w-full bg-card/40" />
            </div>
            <span className="text-[10px] font-medium text-white drop-shadow-md">
              {item.progress}%
            </span>
          </>
        )}
      </div>
    </div>
  );
});
UploadingItem.displayName = "UploadingItem";

export function PhotoGrid({
  photos,
  uploadingPhotos = [],
  isLoading,
  canEditRenovation,
  onUpload,
  onDelete,
}: PhotoGridProps) {
  return (
    // 设计稿 .photos：flex 横向排列、gap 10px（V4.4 移除「下载本阶段全部」行）
    <div className="flex flex-wrap gap-2.5">
      {/* 1. Server Photos - [优化] 使用 memoized 组件 */}
      {photos.map((photo) => (
        <PhotoItem
          key={photo.id}
          photo={photo}
          canEditRenovation={canEditRenovation}
          onDelete={onDelete}
        />
      ))}

      {/* 2. Uploading Photos */}
      {uploadingPhotos.map((item) => (
        <UploadingItem key={item.id} item={item} />
      ))}

      {/* 3. Upload Button（设计稿 .ph.add：92×70 虚线块 + 加号图标） */}
      {canEditRenovation && (
        <label
          title="上传照片"
          className="grid h-[70px] w-[92px] shrink-0 cursor-pointer place-items-center rounded-[12px] border-[1.5px] border-dashed border-dove text-graphite transition-all hover:border-ink hover:text-ink"
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onUpload}
            disabled={isLoading}
          />
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
        </label>
      )}
    </div>
  );
}
