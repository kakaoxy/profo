"use client";

import { UploadCloud, Plus, Loader2, Eye } from "lucide-react";
import { RenovationPhoto } from "../../../../../types";
import { getFileUrl } from "../../../utils";
// [修复 1] 引入 DialogTitle
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
} from "@/components/ui/dialog";

interface PhotoGridProps {
  photos: RenovationPhoto[];
  isCurrent: boolean;
  isFuture: boolean;
  isLoading: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function PhotoGrid({
  photos,
  isCurrent,
  isFuture,
  isLoading,
  onUpload,
}: PhotoGridProps) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
      {/* 1. 已上传照片 */}
      {photos.map((photo) => (
        <Dialog key={photo.id}>
          <div className="aspect-square relative group rounded-md overflow-hidden bg-slate-100 border border-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFileUrl(photo.url)}
              alt={photo.filename || "现场照片"}
              className="object-cover w-full h-full hover:scale-105 transition-transform duration-500 cursor-pointer"
            />

            {/* 遮罩层：提供预览点击提示 */}
            <DialogTrigger asChild>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors cursor-pointer flex items-center justify-center">
                <Eye className="text-white opacity-0 group-hover:opacity-100 w-6 h-6 drop-shadow-md" />
              </div>
            </DialogTrigger>
          </div>

          {/* 大图预览 Modal */}
          <DialogContent className="max-w-3xl border-none bg-transparent shadow-none p-0">
            {/* [修复 2] 添加隐藏的 Title 以满足无障碍标准 */}
            <DialogTitle className="sr-only">
              照片预览 - {photo.filename || "未命名"}
            </DialogTitle>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFileUrl(photo.url)}
              alt="大图预览"
              className="w-full h-auto rounded-lg shadow-2xl"
            />
          </DialogContent>
        </Dialog>
      ))}

      {/* 2. 上传按钮 (非未来阶段显示) */}
      {!isFuture && (
        <label className="aspect-square rounded-md border-2 border-dashed border-slate-200 bg-white hover:bg-slate-50 hover:border-primary/50 cursor-pointer flex flex-col items-center justify-center transition-colors text-muted-foreground hover:text-primary gap-1 relative overflow-hidden">
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
            {isLoading ? "上传中" : isCurrent ? "上传照片" : "补传"}
          </span>
        </label>
      )}
    </div>
  );
}
