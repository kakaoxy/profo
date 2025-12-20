"use client";

import { useState } from "react";
import {
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
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
import {
  Pencil,
  Trash2,
  Clock,
  Loader2,
  ChevronDown,
  Check,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { formatDate, getRelativeTime, getStatusColor } from "./utils";
import { CreateProjectDialog as ProjectFormDialog } from "../create-project";
import { deleteProjectAction } from "../../actions";
import { Project } from "../../types";
import { STAGE_CONFIG, ViewMode } from "./constants";

interface HeaderProps {
  project: Project;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentProjectStageIndex: number;
  onClose: () => void;
  // [新增] 用于强制刷新完整数据的回调
  onRefresh?: (isFull?: boolean) => Promise<void>;
}

export function ProjectDetailHeader({
  project,
  viewMode,
  setViewMode,
  currentProjectStageIndex,
  onClose,
  onRefresh,
}: HeaderProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // [新增] 编辑前加载完整数据的 Loading 状态
  const [isLoadingFullData, setIsLoadingFullData] = useState(false);

  // [新增] 处理编辑点击：先拉取完整数据，再打开窗口
  const handleEditClick = async () => {
    if (!onRefresh) {
      // 如果没有提供刷新方法，直接打开（兜底）
      setIsEditOpen(true);
      return;
    }

    try {
      setIsLoadingFullData(true);
      // 1. 强制请求 full=true 的数据 (包含 signing_materials 等大字段)
      await onRefresh(true);

      // 2. 数据更新完毕后，project prop 会自动更新，此时再打开弹窗
      setIsEditOpen(true);
    } catch (error) {
      console.error("Failed to load full project data", error);
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
        onClose();
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
    <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 shrink-0">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <SheetTitle className="text-xl font-bold text-slate-900">
              {project.name}
            </SheetTitle>

            {/* 阶段切换下拉菜单 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    // 1. 基础布局与交互样式
                    "inline-flex items-center justify-center rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    // 2. 尺寸与边距
                    "h-6 px-3 shadow-sm",
                    // 3. 动态颜色 (背景色)
                    getStatusColor(project.status),
                    // 4. 强制字体颜色 & Hover 效果
                    "text-white border-0 hover:opacity-85 hover:shadow-md active:scale-95"
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
                      <span className={cn(!isAccessible && "opacity-50")}>
                        {stage.label}
                      </span>
                      {isCurrentView && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                      {!isAccessible && (
                        <Lock className="h-3 w-3 text-muted-foreground" />
                      )}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <SheetDescription className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3" />
            <span>创建于 {formatDate(project.created_at)}</span>
            <span className="text-muted-foreground">
              ({getRelativeTime(project.created_at)})
            </span>
          </SheetDescription>
        </div>

        {/* 操作按钮 (非装修视图显示) */}
        {viewMode !== "renovation" && (
          <div className="flex items-center gap-2">
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

            {/* 2. 编辑弹窗 */}
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
                  <AlertDialogDescription>
                    此操作将把项目标记为删除状态。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={(e) => {
                      e.preventDefault();
                      handleDelete();
                    }}
                    disabled={isDeleting}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                  >
                    {isDeleting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    确认删除
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>
    </SheetHeader>
  );
}
