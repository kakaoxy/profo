"use client";

import React, { memo, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ImageIcon, Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { getFileUrl } from "./utils";
import { PHOTO_CATEGORY_CONFIG } from "../../types";
import type { L4MarketingMedia, PhotoCategory } from "../../types";
import type { PhotosSectionProps } from "./types";

// 照片分组显示组件
interface PhotoGridProps {
  photos: L4MarketingMedia[];
  category: PhotoCategory;
  onPreview: (photo: L4MarketingMedia) => void;
}

const PhotoGrid = memo(function PhotoGrid({ photos, category, onPreview }: PhotoGridProps) {
  const filteredPhotos = useMemo(() => {
    return photos
      .filter((p) => p.photo_category === category)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [photos, category]);

  if (filteredPhotos.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-4 text-center bg-slate-50 rounded-lg">
        暂无{PHOTO_CATEGORY_CONFIG[category].label}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
      {filteredPhotos.map((photo) => (
        <Dialog key={photo.id}>
          <div className="aspect-square relative group rounded-md overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getFileUrl(photo.file_url || photo.thumbnail_url)}
              alt="Photo"
              className="object-cover w-full h-full hover:scale-105 transition-transform duration-500"
            />

            {/* Hover Mask with Preview Icon */}
            <div 
              className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center"
              onClick={() => onPreview(photo)}
            >
              <Eye className="text-white opacity-0 group-hover:opacity-100 w-6 h-6 drop-shadow-md transition-opacity" />
            </div>

            {/* Sort Order Badge */}
            <div className="absolute top-1.5 right-1.5">
              <Badge
                variant="secondary"
                className="text-[10px] bg-black/50 text-white border-0 px-1.5 py-0"
              >
                #{(photo.sort_order ?? 0) + 1}
              </Badge>
            </div>
          </div>
        </Dialog>
      ))}
    </div>
  );
});

// 图片预览对话框组件
interface PhotoPreviewDialogProps {
  photo: L4MarketingMedia | null;
  onClose: () => void;
}

const PhotoPreviewDialog = memo(function PhotoPreviewDialog({ 
  photo, 
  onClose 
}: PhotoPreviewDialogProps) {
  if (!photo) return null;

  return (
    <Dialog open={!!photo} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-none bg-transparent shadow-none p-0">
        <DialogTitle className="sr-only">
          图片预览
        </DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFileUrl(photo.file_url || photo.thumbnail_url)}
          alt="Large Preview"
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        {photo.renovation_stage && (
          <div className="absolute bottom-4 left-4">
            <Badge className="bg-black/60 text-white border-0 text-xs">
              {photo.renovation_stage}
            </Badge>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
});

// 使用 memo 避免不必要的重渲染
export const PhotosSection = memo(function PhotosSection({ 
  project, 
  photos 
}: PhotosSectionProps) {
  const [previewPhoto, setPreviewPhoto] = useState<L4MarketingMedia | null>(null);

  // 按类别分组照片
  const { marketingPhotos, renovationPhotos } = useMemo(() => ({
    marketingPhotos: photos.filter((p) => p.photo_category === "marketing"),
    renovationPhotos: photos.filter((p) => p.photo_category === "renovation"),
  }), [photos]);

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardHeader className="!pb-3 px-5 border-b border-slate-100">
        <CardTitle className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
          照片信息
          <Badge variant="secondary" className="ml-2 text-[10px] bg-slate-100 text-slate-500">
            共 {photos.length} 张
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 !pt-4 !pb-5 space-y-6">
        {/* 营销照片 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge 
              className="text-xs font-medium border-0"
              style={{ 
                backgroundColor: PHOTO_CATEGORY_CONFIG.marketing.bgColor,
                color: PHOTO_CATEGORY_CONFIG.marketing.color 
              }}
            >
              {PHOTO_CATEGORY_CONFIG.marketing.label}
            </Badge>
            <span className="text-xs text-slate-400">
              {marketingPhotos.length} 张
            </span>
          </div>
          <PhotoGrid 
            photos={photos} 
            category="marketing" 
            onPreview={setPreviewPhoto}
          />
        </div>

        {/* 分隔线 */}
        {marketingPhotos.length > 0 && renovationPhotos.length > 0 && (
          <div className="border-t border-slate-100" />
        )}

        {/* 改造照片 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge 
              className="text-xs font-medium border-0"
              style={{ 
                backgroundColor: PHOTO_CATEGORY_CONFIG.renovation.bgColor,
                color: PHOTO_CATEGORY_CONFIG.renovation.color 
              }}
            >
              {PHOTO_CATEGORY_CONFIG.renovation.label}
            </Badge>
            <span className="text-xs text-slate-400">
              {renovationPhotos.length} 张
            </span>
          </div>
          <PhotoGrid 
            photos={photos} 
            category="renovation" 
            onPreview={setPreviewPhoto}
          />
        </div>

        {/* 空状态 */}
        {photos.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无照片</p>
            <p className="text-xs mt-1">请在编辑页面上传照片</p>
          </div>
        )}
      </CardContent>

      {/* 图片预览对话框 */}
      <PhotoPreviewDialog 
        photo={previewPhoto} 
        onClose={() => setPreviewPhoto(null)} 
      />
    </Card>
  );
});
