"use client";

import * as React from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MarketingInfoFields } from "./MarketingInfoFields";
import { BasicConfigFields } from "./BasicConfigFields";
import { useMiniProjectForm } from "./useMiniProjectForm";
import type { EditModeProps } from "../form-types";
import { DualPhotoManager } from "../../[id]/_components/dual-photo-manager";
import Link from "next/link";
import type { L4MarketingMedia } from "../../types";
import type { MediaFile } from "../form-schema";

// 将 L4MarketingMedia 转换为 MediaFile
function convertToMediaFiles(photos: L4MarketingMedia[]): MediaFile[] {
  return photos.map((photo) => ({
    file_url: photo.file_url,
    thumbnail_url: photo.thumbnail_url || undefined,
    media_type: (photo.media_type as "image" | "video") || "image",
    photo_category: photo.photo_category,
    renovation_stage: photo.renovation_stage,
    description: photo.description || undefined,
    sort_order: photo.sort_order,
  }));
}

export function EditMode({ mode, project, photos, actions }: EditModeProps) {
  const [localPhotos, setLocalPhotos] = React.useState<L4MarketingMedia[]>(photos);
  
  // 创建模式下，从 localPhotos 构建 mediaFiles
  const mediaFiles = React.useMemo(() => {
    if (mode === "create") {
      return convertToMediaFiles(localPhotos);
    }
    return undefined;
  }, [mode, localPhotos]);
  
  const { form, onSubmit, isSubmitting } = useMiniProjectForm({
    mode,
    project,
    actions,
    mediaFiles,
  });

  // 处理照片变化
  const handlePhotosChange = React.useCallback((newPhotos: L4MarketingMedia[]) => {
    setLocalPhotos(newPhotos);
  }, []);

  const submitButtonText = isSubmitting
    ? mode === "create"
      ? "创建中..."
      : "保存中..."
    : mode === "create"
      ? "创建项目"
      : "保存并发布";

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* 左侧：主要信息和照片 */}
          <div className="lg:col-span-8 space-y-6">
            <MarketingInfoFields />

            <DualPhotoManager
              projectId={project?.id}
              photos={localPhotos}
              onPhotosChange={handlePhotosChange}
            />
          </div>

          {/* 右侧：配置和标签风格 */}
          <div className="lg:col-span-4 space-y-6">
            <BasicConfigFields />
          </div>
        </div>

        {/* Fixed Bottom Actions */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#0b1c30]/90 backdrop-blur-xl px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-8 z-50">
          <div className="flex flex-col">
            <span className="text-[#707785]/60 text-[10px] uppercase font-bold tracking-widest">当前状态</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#85fa51] rounded-full animate-pulse"></div>
              <span className="text-white text-sm font-bold">
                {mode === "create" ? "正在创建新项目" : `正在编辑: 房源 #${project?.id}`}
              </span>
            </div>
          </div>
          <div className="h-8 w-px bg-white/10"></div>
          <div className="flex gap-4">
            <Link
              href="/l4-marketing/projects"
              className="text-white/60 text-xs font-bold hover:text-white transition-colors px-3 py-2"
            >
              取消修改
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-[#005daa] hover:bg-[#0075d5] text-white text-xs font-black px-6 py-2 rounded-lg transition-all shadow-lg shadow-[#005daa]/20"
            >
              {submitButtonText}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
