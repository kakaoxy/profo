"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDot,
  Circle,
  UploadCloud,
  Trash2,
  Loader2,
  Calendar as CalendarIcon,
  ChevronDown,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { zhCN } from "date-fns/locale";

import type { components } from "@/lib/api-types";
import { cn } from "@/lib/utils";
import { isValidUrl } from "@/lib/validators";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

import { RENOVATION_STAGES } from "../../_components/project-detail/constants";
import { getThumbnailUrl } from "../../_components/project-detail/utils";
import { useRenovationUpload } from "../../_components/project-detail/views/renovation/components/use-renovation-upload";
import { getRenovationPhotosAction } from "../../actions/client";
import {
  updateRenovationStageAction,
  deleteRenovationPhotoAction,
} from "../../actions/renovation";
import type { RenovationPhoto } from "../../types";

// 后端 ProjectResponse 已附带 renovation.can_edit_renovation 业务身份标志，
// 但该字段由后端动态计算，api-types.d.ts 可能未及时同步，此处以交叉类型补齐
type ProjectResponse = components["schemas"]["ProjectResponse"] & {
  renovation?: { can_edit_renovation?: boolean } | null;
};

interface MobileRenovationViewProps {
  projectId: string;
  project: ProjectResponse;
}

// ---------------------------------------------------------------------------
// MobileStageCard — 单个阶段卡片（含上传/完成逻辑）
// ---------------------------------------------------------------------------

interface MobileStageCardProps {
  stage: (typeof RENOVATION_STAGES)[number];
  index: number;
  currentIndex: number;
  projectId: string;
  photos: RenovationPhoto[];
  isExpanded: boolean;
  isReadOnly: boolean;
  canEditRenovation: boolean;
  canComplete: boolean;
  stageFinishDate?: string | null;
  onToggle: () => void;
  onRefresh: () => void;
  onStageCompleted: (nextStageKey: string) => void;
}

function MobileStageCard({
  stage,
  index,
  currentIndex,
  projectId,
  photos,
  isExpanded,
  isReadOnly,
  canEditRenovation,
  canComplete,
  stageFinishDate,
  onToggle,
  onRefresh,
  onStageCompleted,
}: MobileStageCardProps) {
  const router = useRouter();
  const [isSubmittingStage, setIsSubmittingStage] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    setSelectedDate(new Date());
  }, []);

  const { uploadQueue, handleUpload } = useRenovationUpload({
    projectId,
    stageValue: stage.value,
    onPhotoUploaded: onRefresh,
  });

  const isCompleted = !!stageFinishDate || index < currentIndex;
  const isCurrent = !isCompleted && index === currentIndex;
  const isFuture = !isCompleted && index > currentIndex;
  const canEdit = canEditRenovation && !isReadOnly && !isFuture;

  const handleSubmit = async () => {
    if (uploadQueue.length > 0) {
      toast.warning("请等待图片上传完成");
      return;
    }
    if (photos.length === 0) {
      toast.error("请至少上传一张验收照片");
      return;
    }

    setIsSubmittingStage(true);
    try {
      const nextStage = RENOVATION_STAGES[index + 1];
      const res = await updateRenovationStageAction({
        projectId,
        renovation_stage: nextStage ? nextStage.value : "已完成",
        stage_completed_at: selectedDate?.toISOString(),
      });

      if (res.success) {
        toast.success(
          `完成 ${stage.label}${nextStage ? `，进入 ${nextStage.label}` : ""}`,
        );
        router.refresh();
        await onRefresh();
        if (nextStage) {
          onStageCompleted(nextStage.key);
        }
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsSubmittingStage(false);
    }
  };

  const handleDelete = async (photoId: string) => {
    if (!confirm("确定要删除这张照片吗？")) return;
    const toastId = toast.loading("正在删除...");
    try {
      const res = await deleteRenovationPhotoAction(projectId, photoId);
      if (res.success) {
        toast.success("删除成功");
        onRefresh();
      } else {
        throw new Error(res.message);
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "删除失败";
      toast.error(msg);
    } finally {
      toast.dismiss(toastId);
    }
  };

  const renderFinishDate = () => {
    if (!stageFinishDate) return null;
    try {
      const date = parseISO(stageFinishDate);
      if (isValid(date)) {
        return (
          <span className="text-[12px] text-success font-mono">
            {format(date, "MM-dd")}
          </span>
        );
      }
    } catch {
      return null;
    }
    return null;
  };

  // 折叠态：已完成阶段展示前 4 张缩略图
  const renderCollapsedThumbnails = () => {
    if (photos.length === 0) return null;
    const visible = photos.slice(0, 4);
    const remaining = photos.length - 4;
    return (
      <div className="grid grid-cols-4 gap-1.5 mt-2">
        {visible.map((photo) => {
          const url = getThumbnailUrl(photo.thumbnail_url, photo.url);
          return (
            <div
              key={photo.id}
              className="aspect-square rounded-md overflow-hidden bg-muted relative"
            >
              {isValidUrl(url) ? (
                <Image
                  src={url}
                  alt={photo.filename || "照片"}
                  fill
                  sizes="20vw"
                  unoptimized
                  className="object-cover"
                />
              ) : null}
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="aspect-square rounded-md bg-muted/80 flex items-center justify-center text-xs text-muted-foreground font-medium">
            +{remaining}
          </div>
        )}
      </div>
    );
  };

  // 展开态：照片网格 + 上传按钮 + 完成阶段按钮
  const renderExpandedContent = () => {
    return (
      <div className="space-y-3">
        {/* 照片网格 + 上传中项 */}
        {(photos.length > 0 || uploadQueue.length > 0) && (
          <div className="grid grid-cols-2 gap-2">
            {photos.map((photo) => {
              const url = getThumbnailUrl(photo.thumbnail_url, photo.url);
              return (
                <div
                  key={photo.id}
                  className="aspect-square relative rounded-lg overflow-hidden bg-muted border border-border group"
                >
                  {isValidUrl(url) ? (
                    <Image
                      src={url}
                      alt={photo.filename || "照片"}
                      fill
                      sizes="50vw"
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                  {canEdit && (
                    <button
                      onClick={() => handleDelete(photo.id)}
                      className="absolute top-1 right-1 z-10 bg-black/50 backdrop-blur-sm p-1.5 rounded-full text-white hover:bg-error transition-colors"
                      title="删除照片"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
            {uploadQueue.map((item) => (
              <div
                key={item.id}
                className="aspect-square relative rounded-lg overflow-hidden bg-muted border border-border"
              >
                <Image
                  src={item.previewUrl}
                  alt="上传中"
                  fill
                  sizes="50vw"
                  unoptimized
                  className="object-cover opacity-60"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 p-2 gap-1.5">
                  {item.status === "error" ? (
                    <span className="text-xs text-white bg-error/90 px-2 py-1 rounded font-medium">
                      上传失败
                    </span>
                  ) : (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-white" />
                      <div className="w-full px-2">
                        <Progress
                          value={item.progress}
                          className="h-1.5 w-full bg-white/30"
                        />
                      </div>
                      <span className="text-[10px] text-white font-medium">
                        {item.progress}%
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 上传按钮 */}
        {canEdit && (
          <label className="flex items-center justify-center gap-2 min-h-[48px] w-full rounded-lg border-2 border-dashed border-border bg-card hover:bg-muted hover:border-primary/50 cursor-pointer transition-colors text-muted-foreground hover:text-primary">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={isSubmittingStage}
            />
            {isSubmittingStage ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <UploadCloud className="h-5 w-5" />
            )}
            <span className="text-sm font-medium">
              {isSubmittingStage ? "处理中..." : "上传照片"}
            </span>
          </label>
        )}

        {/* 完成阶段按钮（仅当前阶段且非只读且有权限） */}
        {isCurrent && !isReadOnly && canComplete && (
          <div className="flex flex-col gap-3 pt-1">
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="min-h-[48px] w-full justify-start text-left font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {selectedDate
                    ? format(selectedDate, "yyyy/MM/dd", { locale: zhCN })
                    : "选择验收日期"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    setSelectedDate(d);
                    setIsCalendarOpen(false);
                  }}
                  initialFocus
                  locale={zhCN}
                />
              </PopoverContent>
            </Popover>
            <Button
              className="min-h-[48px] w-full"
              onClick={handleSubmit}
              disabled={isSubmittingStage}
            >
              {isSubmittingStage && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              完成阶段
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border p-4 transition-all",
        isFuture && "opacity-60",
      )}
    >
      {/* 卡片头部 */}
      <button
        onClick={() => !isFuture && onToggle()}
        disabled={isFuture}
        className={cn(
          "flex items-center gap-3 w-full text-left",
          isFuture ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        {isCompleted ? (
          <CheckCircle2 className="h-6 w-6 text-status-selling fill-status-selling/10 shrink-0" />
        ) : isCurrent ? (
          <CircleDot className="h-6 w-6 text-status-renovating animate-pulse shrink-0" />
        ) : (
          <Circle className="h-6 w-6 text-muted-foreground/30 shrink-0" />
        )}
        <span
          className={cn(
            "transition-colors flex-1",
            isCurrent
              ? "font-bold text-foreground"
              : "font-medium text-muted-foreground",
          )}
        >
          {stage.label}
        </span>
        {renderFinishDate()}
        {(photos.length > 0 || uploadQueue.length > 0) && !isExpanded && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 rounded">
            {photos.length + uploadQueue.length} 张
          </span>
        )}
        {!isFuture && (
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform shrink-0",
              isExpanded && "rotate-180",
            )}
          />
        )}
      </button>

      {/* 卡片内容 */}
      {isExpanded && !isFuture && (
        <div className="mt-4">{renderExpandedContent()}</div>
      )}
      {!isExpanded && isCompleted && renderCollapsedThumbnails()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MobileRenovationView — 主组件
// ---------------------------------------------------------------------------

export function MobileRenovationView({
  projectId,
  project,
}: MobileRenovationViewProps) {
  const router = useRouter();
  const { hasAnyPermission } = usePermission();
  const [photos, setPhotos] = useState<RenovationPhoto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 业务身份校验：权限码 OR 后端计算的业务身份标志
  const canEditByPermission = hasAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
    PERMISSION_CODES.PROJECT_WRITE,
  ]);
  const canCompleteByPermission = hasAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
    PERMISSION_CODES.PROJECT_WRITE,
  ]);
  const canEditRenovation =
    canEditByPermission || project.renovation?.can_edit_renovation === true;
  const canComplete =
    canCompleteByPermission || project.renovation?.can_edit_renovation === true;

  // 计算当前阶段索引（与 kpi.tsx 逻辑一致）
  const currentIndex = useMemo(() => {
    if (
      project.renovation_stage === "已完成" ||
      project.status === "selling" ||
      project.status === "sold"
    ) {
      return RENOVATION_STAGES.length;
    }
    const idx = RENOVATION_STAGES.findIndex(
      (s) => s.value === project.renovation_stage,
    );
    return idx === -1 ? 0 : idx;
  }, [project.renovation_stage, project.status]);

  const isReadOnly = project.status !== "renovating";

  // 默认展开当前阶段（全部完成时展开最后一个阶段）
  const defaultExpandedKey =
    currentIndex < RENOVATION_STAGES.length
      ? RENOVATION_STAGES[currentIndex].key
      : RENOVATION_STAGES[RENOVATION_STAGES.length - 1].key;
  const [expandedStage, setExpandedStage] = useState<string>(defaultExpandedKey);

  const refreshPhotos = useCallback(async () => {
    try {
      const res = await getRenovationPhotosAction(projectId);
      if (res.success && Array.isArray(res.data)) {
        setPhotos(res.data as RenovationPhoto[]);
      }
    } catch {
      toast.error("加载装修照片失败");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refreshPhotos();
  }, [refreshPhotos]);

  // 按阶段分组照片
  const photosByStage = useMemo(() => {
    const map: Record<string, RenovationPhoto[]> = {};
    for (const photo of photos) {
      if (!map[photo.stage]) map[photo.stage] = [];
      map[photo.stage].push(photo);
    }
    return map;
  }, [photos]);

  const communityName = project.community_name || project.name || "未知项目";

  const currentStageLabel =
    currentIndex < RENOVATION_STAGES.length
      ? RENOVATION_STAGES[currentIndex].label
      : "已完成";

  const progressValue =
    currentIndex >= RENOVATION_STAGES.length
      ? 100
      : Math.round(((currentIndex + 1) / RENOVATION_STAGES.length) * 100);

  const handleStageCompleted = useCallback((nextStageKey: string) => {
    setExpandedStage(nextStageKey);
  }, []);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* 粘性顶栏 */}
      <div className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b">
        <div className="flex items-center gap-2 px-4 h-14">
          <button
            onClick={() => router.back()}
            className="h-10 w-10 flex items-center justify-center -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="text-base font-semibold truncate flex-1">
            {communityName}
          </span>
        </div>
      </div>

      {/* KPI 概览 */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              当前阶段
            </span>
            <div className="text-xl font-bold text-foreground">
              {currentStageLabel}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4 flex flex-col gap-2">
            <span className="text-xs text-muted-foreground font-medium">
              总体进度
            </span>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-foreground">
                {progressValue}
              </span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <Progress
              value={progressValue}
              className="h-2"
              indicatorClassName="bg-status-renovating"
            />
          </CardContent>
        </Card>
      </div>

      {/* 阶段时间线 */}
      <div className="px-4 pb-20 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          RENOVATION_STAGES.map((stage, index) => {
            const stagePhotos = photosByStage[stage.value] || [];
            const stageFinishDate =
              project.renovationStageDates?.[stage.value];
            const isExpanded = expandedStage === stage.key;
            return (
              <MobileStageCard
                key={stage.key}
                stage={stage}
                index={index}
                currentIndex={currentIndex}
                projectId={projectId}
                photos={stagePhotos}
                isExpanded={isExpanded}
                isReadOnly={isReadOnly}
                canEditRenovation={canEditRenovation}
                canComplete={canComplete}
                stageFinishDate={stageFinishDate}
                onToggle={() =>
                  setExpandedStage((prev) =>
                    prev === stage.key ? "" : stage.key,
                  )
                }
                onRefresh={refreshPhotos}
                onStageCompleted={handleStageCompleted}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
