"use client";

import * as React from "react";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { MarketingInfoFields } from "./MarketingInfoFields";
import { StageDatesFields } from "./StageDatesFields";
import { BasicConfigFields } from "./BasicConfigFields";
import { useMiniProjectForm } from "./useMiniProjectForm";
import { useProjectImport } from "./useProjectImport";
import type { EditModeProps } from "../form-types";
import { ProjectSelector } from "../project-selector/ProjectSelector";
import { ImportPreview } from "../project-selector/ImportPreview";
import { ProjectImportButton } from "./ProjectImportButton";
import { useRouter } from "next/navigation";
import type { L4MarketingMedia } from "../../types";
import type { MediaFile } from "../form-schema";
import type { ImportableMedia } from "../project-selector/types";
import dynamic from "next/dynamic";

function PhotoManagerSkeleton() {
  return (
    <div className="bg-fog rounded-3xl p-8 animate-pulse">
      <div className="h-6 w-32 bg-dove/30 rounded mb-6" />
      <div className="space-y-4">
        <div className="h-10 bg-dove/30 rounded" />
        <div className="h-32 bg-dove/30 rounded" />
      </div>
    </div>
  );
}

const DualPhotoManager = dynamic(() => import("../photo-manager").then((m) => m.DualPhotoManager), {
  ssr: false,
  loading: () => <PhotoManagerSkeleton />,
});

/**
 * 验证媒体项是否有有效的 file_url
 * 用于过滤无效的媒体数据，避免传递到后端导致验证失败
 */
function hasValidFileUrl<T extends { file_url?: string | null }>(item: T): boolean {
  return !!item.file_url && item.file_url.trim().length > 0;
}

// 将 L4MarketingMedia 转换为 MediaFile
function convertToMediaFiles(photos: L4MarketingMedia[]): MediaFile[] {
  return photos.filter(hasValidFileUrl).map((photo) => ({
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
  return media.filter(hasValidFileUrl).map((item, index) => ({
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

/**
 * 计算照片是否有变更（编辑模式检测）
 * 数量变化、存在临时ID（负数或大于特定值的ID表示新上传）或 sort_order 变化（拖拽重排）即视为有变更
 */
function computeHasPhotoChanges(
  mode: "create" | "edit",
  photos: L4MarketingMedia[],
  initialPhotos: L4MarketingMedia[],
): boolean {
  if (mode !== "edit") return false;
  if (photos.length !== initialPhotos.length) return true;
  // 检测拖拽重排：比较每个照片的 sort_order 是否与初始一致
  const initialSort = new Map(initialPhotos.map((p) => [p.id, p.sort_order]));
  const hasSortChange = photos.some((p) => initialSort.get(p.id) !== p.sort_order);
  if (hasSortChange) return true;
  return photos.some((p) => {
    const id = Number(p.id);
    return id < 0 || id > 1000000000000;
  });
}

export function EditMode({
  mode,
  project,
  photos,
  actions,
  defaultConsultantId,
  embedded = false,
  onSaved,
  onCancelEdit,
  onDirtyChange,
}: EditModeProps) {
  const router = useRouter();
  const [localPhotos, setLocalPhotos] = React.useState<L4MarketingMedia[]>(photos);
  // 保存初始照片用于比较（惰性初始化，组件生命周期内不变）
  const [initialPhotos] = React.useState(photos);
  // 派生状态：跟踪照片是否有变更（用于编辑模式检测）
  const hasPhotoChanges = React.useMemo(
    () => computeHasPhotoChanges(mode, localPhotos, initialPhotos),
    [mode, localPhotos, initialPhotos],
  );

  // 创建模式下，从 localPhotos 构建 mediaFiles
  const mediaFiles = React.useMemo(() => {
    if (mode === "create") {
      return convertToMediaFiles(localPhotos);
    }
    return undefined;
  }, [mode, localPhotos]);

  // 保存成功后的去向：embedded 模式回调宿主（详情抽屉双态容器），非 embedded 跳转列表
  const handleSuccess = React.useCallback(() => {
    if (embedded) {
      onSaved?.();
      return;
    }
    router.push("/admin/marketing");
  }, [embedded, onSaved, router]);

  const { form, onSubmit, isSubmitting, errors } = useMiniProjectForm({
    mode,
    project,
    actions,
    mediaFiles,
    hasPhotoChanges,
    defaultConsultantId,
    onSuccess: handleSuccess,
  });

  // dirty 状态上报宿主（详情抽屉据此在关闭/切态时拦截确认）
  const isDirty = React.useMemo(
    () => Object.keys(form.formState.dirtyFields).length > 0 || hasPhotoChanges,
    [form.formState.dirtyFields, hasPhotoChanges],
  );
  React.useEffect(() => {
    if (mode === "edit") {
      onDirtyChange?.(isDirty);
    }
  }, [isDirty, mode, onDirtyChange]);

  // 取消：embedded 模式回调宿主退出编辑态，非 embedded 跳转列表
  const handleCancel = React.useCallback(() => {
    if (embedded) {
      onCancelEdit?.();
      return;
    }
    router.push("/admin/marketing");
  }, [embedded, onCancelEdit, router]);

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
  const handlePhotosChange = React.useCallback(
    (update: L4MarketingMedia[] | ((prev: L4MarketingMedia[]) => L4MarketingMedia[])) => {
      setLocalPhotos((prev) => {
        const newPhotos =
          typeof update === "function"
            ? (update as (prev: L4MarketingMedia[]) => L4MarketingMedia[])(prev)
            : update;
        return newPhotos;
      });
    },
    [],
  );

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
            <div className="bg-error-container border border-error/30 rounded-lg p-4 mb-4">
              <h4 className="text-red-800 font-medium text-sm mb-2">
                表单验证失败，请检查以下字段：
              </h4>
              <ul className="list-disc list-inside text-error text-sm space-y-1">
                {Object.entries(errors).map(([field, error]) => (
                  <li key={field}>
                    {field}: {String(error?.message ?? "验证失败")}
                  </li>
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

              <StageDatesFields />

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

          {/* 操作栏：embedded 模式（详情抽屉）在表单尾部渲染 sticky 底栏（sticky 于 Sheet 滚动容器，
              不用 fixed —— 在 Sheet 内会错位出屏）；非 embedded（创建页）沿用 fixed 底栏 */}
          {embedded ? (
            <div className="sticky bottom-0 -mx-6 z-10 mt-6 border-t border-dove/40 bg-white/95 px-6 py-4 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success"></div>
                  <span className="text-xs text-graphite">正在编辑: 房源 #{project?.id}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={handleCancel}
                    className="rounded-full border-dove bg-white text-ink hover:bg-fog"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="rounded-full bg-ink px-6 text-sm font-medium text-white transition-all hover:bg-ink/90"
                  >
                    {submitButtonText}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-6 rounded-3xl bg-white/95 px-6 py-4 shadow-steep backdrop-blur-xl">
              <div className="flex flex-col">
                <span className="text-[10px] font-medium uppercase tracking-wider text-graphite">
                  当前状态
                </span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-success"></div>
                  <span className="text-sm font-medium text-ink">
                    {mode === "create" ? "正在创建新项目" : `正在编辑: 房源 #${project?.id}`}
                  </span>
                </div>
              </div>
              <div className="h-8 w-px bg-dove/40"></div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-2 text-sm text-graphite transition-colors hover:text-ink"
                >
                  取消
                </button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-full bg-ink px-6 py-2 text-sm font-medium text-white transition-all hover:bg-ink/90"
                >
                  {submitButtonText}
                </Button>
              </div>
            </div>
          )}
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
