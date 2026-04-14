"use client";

import React, { memo, useMemo, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, Eye, ImageOff, Upload, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getFileUrl } from "./utils";
import { PHOTO_CATEGORY_CONFIG, RENOVATION_STAGES } from "../../types";
import type { L4MarketingMedia, PhotoCategory } from "../../types";
import type { PhotosSectionProps } from "./types";

// 获取装修阶段标签
function getRenovationStageLabel(stage?: string | null): string {
  if (!stage) return "";
  const found = RENOVATION_STAGES.find((s) => s.value === stage);
  return found?.label || stage;
}

// 单个照片项组件（带加载失败处理）
interface PhotoItemProps {
  photo: L4MarketingMedia;
  onPreview: (photo: L4MarketingMedia) => void;
  showStage?: boolean;
}

const PhotoItem = memo(function PhotoItem({ photo, onPreview, showStage }: PhotoItemProps) {
  const [isError, setIsError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const handleError = useCallback(() => {
    setIsError(true);
    setIsLoading(false);
  }, []);

  const handleLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const imageUrl = getFileUrl(photo.file_url || photo.thumbnail_url);
  const stageLabel = showStage ? getRenovationStageLabel(photo.renovation_stage) : "";

  return (
    <div
      className="aspect-square relative group rounded-lg overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer"
      onClick={() => onPreview(photo)}
    >
      {isError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100">
          <ImageOff className="w-8 h-8 text-slate-300 mb-1" />
          <span className="text-[10px] text-slate-400">加载失败</span>
        </div>
      ) : (
        <>
          <img
            src={imageUrl}
            alt="Photo"
            className={`object-cover w-full h-full hover:scale-105 transition-transform duration-500 ${
              isLoading ? "opacity-0" : "opacity-100"
            }`}
            onError={handleError}
            onLoad={handleLoad}
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-400 rounded-full animate-spin" />
            </div>
          )}

          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <Eye className="text-white opacity-0 group-hover:opacity-100 w-6 h-6 drop-shadow-md transition-opacity" />
          </div>
        </>
      )}

      {/* 装修阶段标签 */}
      {showStage && stageLabel && (
        <div className="absolute top-2 left-2">
          <Badge className="bg-black/60 text-white text-[10px] border-0 px-1.5 py-0">
            {stageLabel}
          </Badge>
        </div>
      )}
    </div>
  );
});

// 照片网格组件
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
      <div className="text-sm text-slate-400 py-8 text-center bg-slate-50 rounded-lg">
        暂无{PHOTO_CATEGORY_CONFIG[category].label}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
      {filteredPhotos.map((photo) => (
        <PhotoItem
          key={photo.id}
          photo={photo}
          onPreview={onPreview}
          showStage={category === "renovation"}
        />
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
  onClose,
}: PhotoPreviewDialogProps) {
  if (!photo) return null;

  return (
    <Dialog open={!!photo} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl border-none bg-transparent shadow-none p-0">
        <DialogTitle className="sr-only">图片预览</DialogTitle>
        <img
          src={getFileUrl(photo.file_url || photo.thumbnail_url)}
          alt="Large Preview"
          className="w-full h-auto max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
        {photo.renovation_stage && (
          <div className="absolute bottom-4 left-4">
            <Badge className="bg-black/60 text-white border-0 text-xs">
              {getRenovationStageLabel(photo.renovation_stage)}
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
  photos,
}: PhotosSectionProps) {
  const [previewPhoto, setPreviewPhoto] = useState<L4MarketingMedia | null>(null);

  // 按类别分组照片
  const { marketingPhotos, renovationPhotos } = useMemo(
    () => ({
      marketingPhotos: photos.filter((p) => p.photo_category === "marketing"),
      renovationPhotos: photos.filter((p) => p.photo_category === "renovation"),
    }),
    [photos]
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">媒体资源</span>
          <Badge variant="secondary" className="text-[10px] bg-slate-100 text-slate-500">
            共 {photos.length} 张
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Upload className="mr-1 h-3 w-3" />
            上传照片
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs">
            <Link2 className="mr-1 h-3 w-3" />
            关联L3照片
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4">
        {photos.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无照片</p>
            <p className="text-xs mt-1">请上传或关联照片</p>
          </div>
        ) : (
          <Tabs defaultValue="marketing" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="marketing" className="text-xs">
                营销照片
                <Badge variant="secondary" className="ml-1.5 text-[10px] bg-slate-100 text-slate-500">
                  {marketingPhotos.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="renovation" className="text-xs">
                改造照片
                <Badge variant="secondary" className="ml-1.5 text-[10px] bg-slate-100 text-slate-500">
                  {renovationPhotos.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="marketing" className="mt-0">
              <PhotoGrid
                photos={photos}
                category="marketing"
                onPreview={setPreviewPhoto}
              />
            </TabsContent>

            <TabsContent value="renovation" className="mt-0">
              <PhotoGrid
                photos={photos}
                category="renovation"
                onPreview={setPreviewPhoto}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>

      {/* 图片预览对话框 */}
      <PhotoPreviewDialog
        photo={previewPhoto}
        onClose={() => setPreviewPhoto(null)}
      />
    </div>
  );
});
