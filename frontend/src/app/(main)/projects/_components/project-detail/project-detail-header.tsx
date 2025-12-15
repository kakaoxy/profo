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
// [修复] 移除了未使用的 Badge 引用
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
}

export function ProjectDetailHeader({
  project,
  viewMode,
  setViewMode,
  currentProjectStageIndex,
  onClose,
}: HeaderProps) {
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
                    // 1. 基础布局与交互样式 (模仿 Shadcn Button)
                    "inline-flex items-center justify-center rounded-full text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
                    // 2. 尺寸与边距
                    "h-6 px-3 shadow-sm",
                    // 3. 动态颜色 (背景色)
                    getStatusColor(project.status),
                    // 4. 强制字体颜色 & Hover 效果 (使用透明度变化，而不是改背景色，这样适配所有颜色的按钮)
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
            <ProjectFormDialog
              project={project}
              open={isEditOpen}
              onOpenChange={setIsEditOpen}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditOpen(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑
                </Button>
              }
              onSuccess={() => setIsEditOpen(false)}
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
