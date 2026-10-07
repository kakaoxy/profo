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

import type { L4MarketingProject, L4MarketingMedia } from "@/app/(main)/admin/marketing/types";
import {
  getL4MarketingProjectAction,
  getL4MarketingMediaAction,
  createL4MarketingProjectAction,
  updateL4MarketingProjectAction,
} from "../actions";

import { MarketingDetailHeader } from "./detail/marketing-detail-header";
import { MarketingInfoSection } from "./detail/marketing-info-section";
import { BasicConfigSection } from "./detail/basic-config-section";
import { PriceChangeCard } from "./price-change-card";
import { PushStatCard } from "./push-stat-card";
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
 *
 * 调价成功链路：PriceChangeCard 内部已用 PUT 响应渲染新价 → 宿主 handlePriceChanged
 * （reloadDetail 换入新 project，刷新左栏信息卡总价与推送统计）→ router.refresh（刷新列表 RSC 缓存）。
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
  /**
   * 重拉详情（编辑保存后回 view 态刷新数据；页面级低频操作，无需请求去重缓存）.
   *
   * @param projectId 项目 ID
   * @param opts.silent 静默模式：不置 isRefreshing（不卸载内容树）。调价成功后用——
   *   若触发全屏 spinner 会卸载 PriceChangeCard，其三态内部 state（成功态）丢失。
   */
  const reloadDetail = useCallback(async (projectId: number, opts?: { silent?: boolean }) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (!opts?.silent) setIsRefreshing(true);
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
      if (!opts?.silent) setIsRefreshing(false);
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

  /** 调价成功：静默 reloadDetail 换入新 project（左栏信息卡/推送统计同步）+ router.refresh（列表 RSC 缓存）。不触发全屏 spinner（避免卸载调价卡丢失成功态） */
  const handlePriceChanged = useCallback(async () => {
    await reloadDetail(project.id, { silent: true });
    router.refresh();
  }, [project.id, reloadDetail, router]);

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
      {/* 顶部导航条：返回 + 标题 + 操作，唯一由 MarketingDetailHeader 渲染
          （edit 态隐藏编辑入口，保存/取消在表单 sticky 底栏） */}
      <MarketingDetailHeader
        project={project}
        onClose={handleBack}
        mode={mode}
        onStartEdit={handleStartEdit}
      />

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
          /* view 态：左主（浏览语义）+ 右辅（高频操作语义）；<1024px 折叠单列，右栏内容顺延 */
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_348px]">
            {/* 左主栏 */}
            <div className="min-w-0 space-y-6">
              {/* 1. 房源信息 - 左右布局（主图+信息） */}
              <MarketingInfoSection project={project} photos={photos} />

              {/* 2. 房源状态 + 管理配置 */}
              <BasicConfigSection project={project} />

              {/* 3. 媒体资源 */}
              <PhotosSection project={project} photos={photos} />
            </div>

            {/* 右辅栏：sticky 常驻（top-20 避开顶栏）——价格与调价 + 推送统计 */}
            <div className="space-y-5 lg:sticky lg:top-20">
              <PriceChangeCard
                variant="card"
                project={project}
                onPriceSuccess={() => void handlePriceChanged()}
              />
              <PushStatCard project={project} />
            </div>
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
