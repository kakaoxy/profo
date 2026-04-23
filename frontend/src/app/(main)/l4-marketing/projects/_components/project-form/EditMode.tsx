"use client";

import * as React from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MarketingInfoFields } from "./MarketingInfoFields";
import { BasicConfigFields } from "./BasicConfigFields";
import { useMiniProjectForm } from "./useMiniProjectForm";
import { useProjectImport } from "./useProjectImport";
import type { EditModeProps } from "../form-types";
import { DualPhotoManager } from "../photo-manager";
import { ProjectSelector } from "../project-selector/ProjectSelector";
import { ImportPreview } from "../project-selector/ImportPreview";
import { ProjectImportButton } from "./ProjectImportButton";
import Link from "next/link";
import type { L4MarketingMedia } from "../../types";
import type { MediaFile } from "../form-schema";
import type { ImportableMedia } from "../project-selector/types";

/**
 * 验证媒体项是否有有效的 file_url
 * 用于过滤无效的媒体数据，避免传递到后端导致验证失败
 */
function hasValidFileUrl<T extends { file_url?: string | null }>(item: T): boolean {
  return !!item.file_url && item.file_url.trim().length > 0;
}

// 将 L4MarketingMedia 转换为 MediaFile
function convertToMediaFiles(photos: L4MarketingMedia[]): MediaFile[] {
  return photos
    .filter(hasValidFileUrl)
    .map((photo) => ({
      file_url: photo.file_url,
      thumbnail_url: photo.thumbnail_url || undefined,
      media_type: (photo.media_type as "image" | "video") || "image",
      photo_category: photo.photo_category,
      renovation_stage: photo.renovation_stage,
      description: photo.description || undefined,
      sort_order: photo.sort_order,
    }));
}

// 将 ImportableMedia 转换为 L4MarketingMedia
function convertImportableToL4Media(media: ImportableMedia[]): L4MarketingMedia[] {
  return media
    .filter(hasValidFileUrl)
    .map((item, index) => ({
      id: Number(item.id) || -Date.now() - index, // 临时ID，负数表示未保存
      file_url: item.file_url,
      thumbnail_url: item.thumbnail_url,
      media_type: item.media_type || "image",
      photo_category: ["marketing", "renovation"].includes(item.photo_category)
        ? (item.photo_category as "marketing" | "renovation")
        : "marketing",
      renovation_stage: item.renovation_stage ?? null,
      description: item.description ?? null,
      sort_order: item.sort_order ?? index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      marketing_project_id: 0, // 临时值，创建后会被后端替换
      is_deleted: false,
    }));
}

export function EditMode({ mode, project, photos, actions }: EditModeProps) {
  const [localPhotos, setLocalPhotos] = React.useState<L4MarketingMedia[]>(photos);
  // 跟踪照片是否有变更（用于编辑模式检测）
  const [hasPhotoChanges, setHasPhotoChanges] = React.useState(false);
  // 保存初始照片数量用于比较
  const initialPhotoCountRef = React.useRef(photos.length);

  // 创建模式下，从 localPhotos 构建 mediaFiles
  const mediaFiles = React.useMemo(() => {
    if (mode === "create") {
      return convertToMediaFiles(localPhotos);
    }
    return undefined;
  }, [mode, localPhotos]);

  const { form, onSubmit, isSubmitting, errors } = useMiniProjectForm({
    mode,
    project,
    actions,
    mediaFiles,
    hasPhotoChanges,
  });

  // 处理导入的媒体数据
  const handleMediaImport = React.useCallback((importedMedia: ImportableMedia[]) => {
    const convertedMedia = convertImportableToL4Media(importedMedia);
    setLocalPhotos((prev) => [...prev, ...convertedMedia]);
  }, []);

  // 项目导入功能
  const {
    isImporting,
    showSelector,
    showPreview,
    selectedProject,
    importData,
    openSelector,
    closeSelector,
    handleSelectProject,
    handleConfirmImport,
    handleCancelImport,
    clearImport,
  } = useProjectImport({ form, onMediaImport: handleMediaImport });

  // 处理照片变化
  const handlePhotosChange = React.useCallback((newPhotos: L4MarketingMedia[]) => {
    setLocalPhotos(newPhotos);
    // 编辑模式下，检测照片是否有变更（数量变化或有新上传的照片）
    if (mode === "edit") {
      const hasChanges = newPhotos.length !== initialPhotoCountRef.current ||
        newPhotos.some(p => {
          // 检测临时ID（负数或大于特定值的ID表示新上传）
          const id = Number(p.id);
          return id < 0 || id > 1000000000000; // 临时ID通常是负数或时间戳
        });
      setHasPhotoChanges(hasChanges);
    }
  }, [mode]);

  const submitButtonText = isSubmitting
    ? mode === "create"
      ? "创建中..."
      : "保存中..."
    : mode === "create"
      ? "创建项目"
      : "保存修改";

  return (
    <>
      <Form {...form}>
        <form onSubmit={onSubmit} className="space-y-6">
          {/* 表单错误提示 */}
          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <h4 className="text-red-800 font-medium text-sm mb-2">表单验证失败，请检查以下字段：</h4>
              <ul className="list-disc list-inside text-red-600 text-sm space-y-1">
                {Object.entries(errors).map(([field, error]) => (
                  <li key={field}>{field}: {error?.message || '验证失败'}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* 左侧：主要信息和照片 */}
            <div className="lg:col-span-8 space-y-6">
              {/* 导入按钮 */}
              <ProjectImportButton
                selectedProject={selectedProject}
                isImporting={isImporting}
                onImport={openSelector}
                onClear={clearImport}
              />

              <MarketingInfoFields />

              <DualPhotoManager
                l3ProjectId={project?.project_id}
                l4ProjectId={project?.id}
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
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 backdrop-blur-xl px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-8 z-50">
            <div className="flex flex-col">
              <span className="text-slate-400 text-[10px] uppercase font-medium tracking-wider">当前状态</span>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-white text-sm font-medium">
                  {mode === "create" ? "正在创建新项目" : `正在编辑: 房源 #${project?.id}`}
                </span>
              </div>
            </div>
            <div className="h-8 w-px bg-white/10"></div>
            <div className="flex gap-4">
              <Link
                href="/l4-marketing/projects"
                className="text-slate-400 text-sm hover:text-white transition-colors px-3 py-2"
              >
                取消
              </Link>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-6 py-2 rounded-lg transition-all"
              >
                {submitButtonText}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      {/* 项目选择器 */}
      <ProjectSelector
        open={showSelector}
        onClose={closeSelector}
        onSelect={handleSelectProject}
        selectedId={selectedProject?.id}
      />

      {/* 导入预览 */}
      {showPreview && importData && (
        <ImportPreview
          data={importData}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
          loading={isImporting}
        />
      )}
    </>
  );
}
