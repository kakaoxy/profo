"use client";

import { logger } from "@/lib/logger";
import React, { useState, useCallback, useRef, memo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

import type { L4MarketingProject, L4MarketingMedia } from "@/app/(main)/admin/marketing/types";
import {
  getL4MarketingProjectAction,
  getL4MarketingMediaAction,
  createL4MarketingProjectAction,
  updateL4MarketingProjectAction,
} from "../actions";
import { Button } from "@/components/ui/button";

import { MarketingDetailHeader } from "./detail/marketing-detail-header";
import { MarketingInfoSection } from "./detail/marketing-info-section";
import { BasicConfigSection } from "./detail/basic-config-section";
import { NotifySection } from "./detail/notify-section";
import { PhotosSection } from "./detail/photos-section";
import { EditMode } from "./project-form/EditMode";

interface MarketingDetailPageProps {
  /** 服务端首屏数据（项目详情） */
  initialProject: L4MarketingProject;
  /** 服务端首屏数据（媒体列表） */
  initialPhotos: L4MarketingMedia[];
}

const detailFormActions = {
  createL4MarketingProject: createL4MarketingProjectAction,
  updateL4MarketingProject: updateL4MarketingProjectAction,
};

/**
 * 营销房源详情页（独立页面，P0-1 页面化重构）.
 *
 * 内部维护 mode: "view" | "edit" 双态（useState，不进 URL）：
 * - view 态：详情四区块 + 「编辑房源」入口 + 调价内联区块
 * - edit 态：整页嵌入 EditMode（embedded 模式：取消/保存 sticky 于页面滚动容器）
 * - 编辑中 isDirty 时离开（返回列表/切回 view）弹「未保存的修改将丢失」确认
 *
 * 保存成功链路：toast（表单 hook 内）→ mode 切回 view → 重拉详情 → router.refresh 刷新列表数据。
 */
export const MarketingDetailPage = memo(function MarketingDetailPage({
  initialProject,
  initialPhotos,
}: MarketingDetailPageProps) {
  const router = useRouter();
  const [project, setProject] = useState<L4MarketingProject>(initialProject);
  const [photos, setPhotos] = useState<L4MarketingMedia[]>(initialPhotos);
  // 详情页双态：view（查看）/ edit（编辑），不进 URL
  const [mode, setMode] = useState<"view" | "edit">("view");
  // 编辑表单 dirty 状态（由 EditMode 上报），离开时拦截确认
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isFetchingRef = useRef(false);

  /** 重拉详情（编辑保存后回 view 态刷新数据；页面级低频操作，无需请求去重缓存） */
  const reloadDetail = useCallback(async (projectId: number) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsRefreshing(true);
    try {
      const [projectRes, photosRes] = await Promise.all([
        getL4MarketingProjectAction(projectId),
        getL4MarketingMediaAction(projectId, 1, 100),
      ]);
      if (projectRes.success && projectRes.data) {
        setProject(projectRes.data as L4MarketingProject);
      }
      if (photosRes.success && photosRes.data) {
        setPhotos((photosRes.data.items as L4MarketingMedia[]) || []);
      }
    } catch (error) {
      logger.error("Failed to reload detail data:", error);
      toast.error("刷新详情数据失败");
    } finally {
      isFetchingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  /** 返回列表（dirty 时先确认） */
  const handleBack = useCallback(() => {
    if (mode === "edit" && isFormDirty) {
      setConfirmAction(() => router.push("/admin/marketing"));
      return;
    }
    router.push("/admin/marketing");
  }, [mode, isFormDirty, router]);

  /** 编辑保存成功：toast 已在表单 hook 内提示 → 回 view 态 → 重拉详情 → 刷新列表数据 */
  const handleSaved = useCallback(async () => {
    setIsFormDirty(false);
    setMode("view");
    await reloadDetail(project.id);
    router.refresh();
  }, [project.id, reloadDetail, router]);

  /** 取消编辑：dirty 时确认丢弃，回 view 态 */
  const handleCancelEdit = useCallback(() => {
    const exitEdit = () => {
      setIsFormDirty(false);
      setMode("view");
    };
    if (isFormDirty) {
      setConfirmAction(exitEdit);
      return;
    }
    exitEdit();
  }, [isFormDirty]);

  /** 切换到编辑态 */
  const handleStartEdit = useCallback(() => {
    setMode("edit");
  }, []);

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setIsFormDirty(dirty);
  }, []);

  // 编辑中关闭/刷新浏览器标签页兜底提示（页内主动返回/切态由 confirmAction 拦截）
  useEffect(() => {
    if (mode !== "edit" || !isFormDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [mode, isFormDirty]);

  // 卸载时清请求标志（防止路由切换后残留阻塞后续请求）
  useEffect(() => {
    return () => {
      isFetchingRef.current = false;
    };
  }, []);

  const isEditMode = mode === "edit";

  return (
    <div className="min-h-screen bg-fog">
      {/* 顶部导航条：返回 + 标题 + 操作（edit 态隐藏编辑入口，保存/取消在表单 sticky 底栏） */}
      <div className="sticky top-0 z-20 border-b border-dove/40 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              className="-ml-2 h-8 w-8 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg leading-tight text-ink">
                {project.title || "未命名项目"}
              </h1>
              {project.community_name ? (
                <span className="text-xs text-graphite">· {project.community_name}</span>
              ) : null}
              <span className="text-xs text-graphite">(ID:{project.id})</span>
            </div>
          </div>

          <MarketingDetailHeader
            project={project}
            onClose={handleBack}
            mode={mode}
            onStartEdit={handleStartEdit}
          />
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        {isRefreshing ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-rust" />
          </div>
        ) : isEditMode ? (
          <EditMode
            mode="edit"
            project={project}
            photos={photos}
            actions={detailFormActions}
            embedded
            onSaved={handleSaved}
            onCancelEdit={handleCancelEdit}
            onDirtyChange={handleDirtyChange}
          />
        ) : (
          <div className="space-y-6">
            {/* 1. 房源信息 - 左右布局（主图+信息） */}
            <MarketingInfoSection project={project} photos={photos} />

            {/* 2. 房源状态 + 管理配置 */}
            <BasicConfigSection project={project} />

            {/* 3. 订阅与调价（送达统计 + 内联调价表单 + 调价历史时间线） */}
            <NotifySection project={project} onRefresh={() => router.refresh()} />

            {/* 4. 媒体资源 */}
            <PhotosSection project={project} photos={photos} />
          </div>
        )}
      </div>

      {/* isDirty 离开确认（返回列表/切回 view 统一拦截） */}
      <AlertDialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>未保存的修改将丢失</AlertDialogTitle>
            <AlertDialogDescription>
              当前有未保存的修改，离开后这些修改将丢失。确定要丢弃并继续吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续编辑</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                setIsFormDirty(false);
                action?.();
              }}
            >
              丢弃修改
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});
