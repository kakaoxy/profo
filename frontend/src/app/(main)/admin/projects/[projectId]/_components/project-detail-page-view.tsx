"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { ArrowLeft, ChevronDown, Check, Clock, Loader2, Pencil, Trash2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

import { Project } from "../../types";
import { updateProjectAction, deleteProjectAction } from "../../actions/core";
import { CreateProjectDialog as ProjectFormDialog } from "../../_components/create-project";
import { useProjectDetail } from "../../_components/project-detail/hooks/use-project-detail";
import { useProjectAttachments } from "../../_components/project-detail/hooks/use-project-attachments";
import { RenovationView } from "../../_components/project-detail/views/renovation";
import { DefaultView } from "../../_components/project-detail/views/default";
import { SellingView } from "../../_components/project-detail/views/selling";
import { SoldView } from "../../_components/project-detail/views/sold";
import { STAGE_CONFIG, type ViewMode } from "../../_components/project-detail/constants";
import { formatDate } from "../../_components/project-detail/utils";
import { formatRelativeTime } from "@/lib/formatters";
import { getProjectStatusClassName } from "@/lib/status-colors";
import type { SigningMaterial } from "../../_components/project-detail/types";

interface ProjectDetailPageViewProps {
  initialProject: Project;
}

/**
 * 项目详情页面视图（[projectId]/page.tsx 的 client 组件）
 *
 * 与 ProjectDetailSheet 共享 hooks（useProjectDetail / useProjectAttachments）
 * 与 views（DefaultView / RenovationView / SellingView / SoldView），
 * 区别在于使用页面布局替代 Sheet 抽屉。
 *
 * 注意：不能复用 ProjectDetailHeader，因其内部使用了 SheetTitle / SheetDescription
 * （Radix Dialog 原语，在 Sheet 外会抛 useDialogContext 错误），
 * 此处用独立 header 实现相同功能（阶段切换 + 编辑 + 删除）。
 */
export function ProjectDetailPageView({ initialProject }: ProjectDetailPageViewProps) {
  const router = useRouter();
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  const {
    project,
    viewMode,
    currentProjectStageIndex,
    refreshProjectData,
    handleViewModeChange,
    handleHandoverSuccess,
    handleListingSuccess,
    handleDealSuccess,
  } = useProjectDetail({ initialProject, isOpen: true });

  const handleUpdateAttachments = useCallback(
    async (attachments: SigningMaterial[]) => {
      if (!project) return;
      const result = await updateProjectAction(project.id, {
        signing_materials: attachments.length
          ? attachments.map((a) => ({ ...a, size: a.size ?? 0 }))
          : null,
      });
      if (!result.success) {
        toast.error(result.message || "附件保存失败");
      }
    },
    [project],
  );

  const { attachments, createHandlers, onUpload } = useProjectAttachments({
    signingMaterials: project?.signing_materials,
    onUpdateAttachments: handleUpdateAttachments,
  });

  const handleUpdateAttachmentsWithRefresh = useCallback(
    async (updatedAttachments: SigningMaterial[]) => {
      await handleUpdateAttachments(updatedAttachments);
      await refreshProjectData(true);
    },
    [handleUpdateAttachments, refreshProjectData],
  );

  if (!project) return null;

  const handlers = createHandlers(setPreviewImage);
  const isSoldMode = viewMode === "sold";
  const viewKey = project.id;

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <PageHeader
        project={project}
        viewMode={viewMode}
        setViewMode={handleViewModeChange}
        currentProjectStageIndex={currentProjectStageIndex}
        onBack={handleClose}
        onRefresh={refreshProjectData}
      />

      <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8 scrollbar-hide [scrollbar-gutter:stable]">
        {isSoldMode ? (
          <SoldView
            project={project}
            viewMode={viewMode}
            setViewMode={handleViewModeChange}
            currentProjectStageIndex={currentProjectStageIndex}
          />
        ) : (
          <>
            {viewMode === "renovation" && (
              <RenovationView
                key={viewKey}
                project={project}
                onRefresh={refreshProjectData}
                onListingSuccess={handleListingSuccess}
              />
            )}
            {viewMode === "selling" && (
              <SellingView
                key={viewKey}
                project={project}
                onRefresh={refreshProjectData}
                onDealSuccess={handleDealSuccess}
              />
            )}
            {(viewMode === "signing" || !["renovation", "selling"].includes(viewMode)) && (
              <DefaultView
                key={viewKey}
                project={project}
                attachments={attachments}
                handlers={handlers}
                onUpdateAttachments={handleUpdateAttachmentsWithRefresh}
                onUploadAttachment={onUpload}
                onHandoverSuccess={handleHandoverSuccess}
              />
            )}
          </>
        )}
      </div>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>图片预览</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center py-4 relative w-full h-[75vh]">
            {previewImage && (
              <Image
                src={previewImage}
                alt="预览"
                fill
                className="object-contain rounded-lg"
                sizes="(max-width: 1024px) 100vw, 1024px"
                priority
                unoptimized
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * 页面级 header：返回按钮 + 项目标题 + 阶段切换 + 编辑/删除
 *
 * 复用 ProjectDetailHeader 的逻辑（阶段切换、编辑弹窗、删除确认），
 * 但使用普通 HTML 元素替代 SheetTitle / SheetDescription（Radix 原语）。
 */
function PageHeader({
  project,
  viewMode,
  setViewMode,
  currentProjectStageIndex,
  onBack,
  onRefresh,
}: {
  project: Project;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentProjectStageIndex: number;
  onBack: () => void;
  onRefresh?: (isFull?: boolean) => Promise<void>;
}) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoadingFullData, setIsLoadingFullData] = useState(false);

  const handleEditClick = async () => {
    if (!onRefresh) {
      setIsEditOpen(true);
      return;
    }
    try {
      setIsLoadingFullData(true);
      await onRefresh(true);
      setIsEditOpen(true);
    } catch (error) {
      logger.error("Failed to load full project data", error);
      toast.error("加载项目数据失败，请重试");
    } finally {
      setIsLoadingFullData(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteProjectAction(project.id);
      if (res.success) {
        toast.success("项目已删除");
        onBack();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const formKey = `${project.id}-${project.updated_at}-${
    project.signing_materials ? "loaded" : "empty"
  }`;

  return (
    <header className="sticky top-0 z-10 shrink-0 border-b bg-background px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="h-8 w-8 p-0 rounded-full"
            aria-label="返回"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <h1 className="text-xl font-bold text-foreground">{project.name}</h1>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center justify-center rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                  "h-6 px-3 shadow-sm",
                  getProjectStatusClassName(project.status),
                  "border-0 hover:opacity-85 hover:shadow-md active:scale-95",
                )}
              >
                {STAGE_CONFIG.find((s) => s.key === viewMode)?.label}
                <ChevronDown className="ml-1 h-3 w-3 opacity-80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                切换项目阶段视图
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STAGE_CONFIG.map((stage, index) => {
                const isAccessible = index <= currentProjectStageIndex;
                const isCurrentView = viewMode === stage.key;
                return (
                  <DropdownMenuItem
                    key={stage.key}
                    disabled={!isAccessible}
                    onClick={() => setViewMode(stage.key)}
                    className="flex items-center justify-between"
                  >
                    <span className={cn(!isAccessible && "opacity-50")}>{stage.label}</span>
                    {isCurrentView && <Check className="h-4 w-4 text-primary" />}
                    {!isAccessible && <Lock className="h-3 w-3 text-muted-foreground" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex items-center gap-2">
          <p className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground mr-2">
            <Clock className="h-3 w-3" />
            <span>创建于 {formatDate(project.created_at)}</span>
            <span>({formatRelativeTime(project.created_at)})</span>
          </p>

          {viewMode !== "renovation" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditClick}
                disabled={isLoadingFullData}
              >
                {isLoadingFullData ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Pencil className="mr-2 h-4 w-4" />
                )}
                编辑
              </Button>

              <ProjectFormDialog
                key={formKey}
                project={project}
                open={isEditOpen}
                onOpenChange={setIsEditOpen}
                onSuccess={async () => {
                  setIsEditOpen(false);
                  if (onRefresh) {
                    await onRefresh(true);
                  }
                }}
                trigger={<span className="hidden" />}
              />

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                    <AlertDialogDescription>此操作将把项目标记为删除状态。</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={(e) => {
                        e.preventDefault();
                        handleDelete();
                      }}
                      disabled={isDeleting}
                      className="bg-error hover:bg-red-700 focus:ring-red-600"
                    >
                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      确认删除
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
