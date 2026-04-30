"use client";

import React, { useState, memo } from "react";
import Image from "next/image";
import { UploadCloud, Plus, Loader2, Trash2, Eye } from "lucide-react";
import { RenovationPhoto } from "../../../../../types";
import { getFileUrl } from "../../../utils";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

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
import { cn } from "@/lib/utils";

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
  isCurrent: boolean;
  isFuture: boolean;
  isLoading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDelete: (photoId: string) => void;
}

// [优化] 使用 memo 缓存照片项组件，避免不必要的重渲染
interface PhotoItemProps {
  photo: RenovationPhoto;
  isFuture: boolean;
  onDelete: (photoId: string) => void;
}

const PhotoItem = memo(function PhotoItem({ photo, isFuture, onDelete }: PhotoItemProps) {
  const [imageLoaded, setImageLoaded] = useState(false);

  return (
    <Dialog>
      <div className="aspect-square relative group rounded-md overflow-hidden bg-muted border border-border">
          <Image
          src={getFileUrl(photo.url)}
          alt={photo.filename || "Renovation Photo"}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 768px) 25vw, 20vw"
          loading="lazy"
          unoptimized
          onLoad={() => setImageLoaded(true)}
          className={cn(
            "object-cover hover:scale-105 transition-all duration-500 cursor-pointer",
            imageLoaded ? "opacity-100" : "opacity-0"
          )}
        />
        {!imageLoaded && (
          <div className="absolute inset-0 bg-muted animate-pulse" />
        )}

        {/* Hover Mask */}
        <DialogTrigger asChild>
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors cursor-pointer flex items-center justify-center">
            <Eye className="text-white opacity-0 group-hover:opacity-100 w-6 h-6 drop-shadow-md" />
          </div>
        </DialogTrigger>

        {/* Delete Button */}
        {!isFuture && (
          <div
            className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="bg-card/90 p-1.5 rounded-full text-error hover:bg-error-container hover:text-error shadow-sm transition-colors"
                  title="Delete Photo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Are you sure you want to delete this photo?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This action will delete the photo record. If physical
                    deletion is configured, the file will also be removed.
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
      <DialogContent className="max-w-3xl border-none bg-transparent shadow-none p-0">
        <DialogTitle className="sr-only">
          Photo Preview - {photo.filename || "Untitled"}
        </DialogTitle>
        <div className="relative w-full aspect-video">
          <Image
            src={getFileUrl(photo.url)}
            alt="Large Preview"
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
});
PhotoItem.displayName = "PhotoItem";

// [优化] 使用 memo 缓存上传中照片项组件
const UploadingItem = memo(function UploadingItem({ item }: { item: UploadingPhoto }) {
  // 使用 ref 存储 previewUrl，避免重复创建 ObjectURL
  const previewRef = React.useRef<string>(item.previewUrl);

  React.useEffect(() => {
    // 组件卸载时释放 ObjectURL
    return () => {
      if (previewRef.current && previewRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(previewRef.current);
      }
    };
  }, []);

  return (
    <div
      className="aspect-square relative rounded-md overflow-hidden bg-muted border border-border"
    >
      {/* Local Preview Image */}
      <Image
        src={previewRef.current}
        alt="Uploading..."
        fill
        sizes="(max-width: 640px) 50vw, (max-width: 768px) 25vw, 20vw"
        unoptimized
        className="object-cover opacity-60 blur-[1px] transition-all"
      />

      {/* Progress Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/10 z-10 p-2 gap-2">
        {item.status === "error" ? (
          <span className="text-xs text-white bg-error/90 px-2 py-1 rounded font-medium">
            Upload Failed
          </span>
        ) : item.progress === 100 ? (
          <>
            <div className="h-6 w-6 rounded-full bg-green-500 flex items-center justify-center">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-[10px] text-white font-medium drop-shadow-md">
              完成
            </span>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-white drop-shadow-md" />
            <div className="w-full px-2">
              <Progress
                value={item.progress}
                className="h-1.5 w-full bg-card/40"
              />
            </div>
            <span className="text-[10px] text-white font-medium drop-shadow-md">
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
  isCurrent,
  isFuture,
  isLoading,
  onUpload,
  onDelete,
}: PhotoGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
      {/* 1. Server Photos - [优化] 使用 memoized 组件 */}
      {photos.map((photo) => (
        <PhotoItem
          key={photo.id}
          photo={photo}
          isFuture={isFuture}
          onDelete={onDelete}
        />
      ))}

      {/* 2. Uploading Photos */}
      {uploadingPhotos.map((item) => (
        <UploadingItem key={item.id} item={item} />
      ))}

      {/* 3. Upload Button */}
      {!isFuture && (
        <label className="aspect-square rounded-md border-2 border-dashed border-border bg-card hover:bg-muted hover:border-primary/50 cursor-pointer flex flex-col items-center justify-center transition-colors text-muted-foreground hover:text-primary gap-1 relative overflow-hidden">
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onUpload}
            disabled={isLoading}
          />
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : isCurrent ? (
            <UploadCloud className="h-6 w-6" />
          ) : (
            <Plus className="h-6 w-6" />
          )}
          <span className="text-xs font-medium">
            {isLoading ? "Processing" : isCurrent ? "Upload" : "Add More"}
          </span>
        </label>
      )}
    </div>
  );
}
