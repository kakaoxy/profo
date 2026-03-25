"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, X, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { InfoCard } from "./ui/InfoCard";
import { DisplayRow } from "./ui/DisplayRow";
import { PhotoGallery } from "./view/PhotoGallery";
import type { L4MarketingProject, L4Consultant, L4MarketingMedia } from "../types";
import { getFileUrl } from "@/lib/config";
import {
  getL4MarketingProjectAction,
  getL4ConsultantsAction,
  getL4MarketingMediaAction,
  refreshL4MarketingProjectAction,
} from "../actions";

// 状态配置
const statusConfig: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-emerald-500 text-white",
  },
  "已售": {
    label: "已售",
    className: "bg-slate-300 text-slate-700",
  },
  "在途": {
    label: "在途",
    className: "bg-blue-500 text-white",
  },
};

interface MarketingDetailSheetProps {
  project: L4MarketingProject | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function MarketingDetailSheet({
  project: initialProject,
  isOpen,
  onClose,
  onRefresh,
}: MarketingDetailSheetProps) {
  const router = useRouter();
  const isFetchingRef = useRef(false);

  const [project, setProject] = useState<L4MarketingProject | null>(initialProject);
  const [consultants, setConsultants] = useState<L4Consultant[]>([]);
  const [photos, setPhotos] = useState<L4MarketingMedia[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 初始化数据
  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject]);

  // 加载详情数据
  const loadDetailData = useCallback(async (projectId: string) => {
    if (isFetchingRef.current) return;

    isFetchingRef.current = true;
    setIsLoading(true);

    try {
      const [projectRes, consultantsRes, photosRes] = await Promise.all([
        getL4MarketingProjectAction(projectId),
        getL4ConsultantsAction(1, 100),
        getL4MarketingMediaAction(projectId, 1, 100),
      ]);

      if (projectRes.success && projectRes.data) {
        setProject(projectRes.data as L4MarketingProject);
      }

      if (consultantsRes.success && consultantsRes.data) {
        setConsultants((consultantsRes.data.items as L4Consultant[]) || []);
      }

      if (photosRes.success && photosRes.data) {
        setPhotos((photosRes.data.items as L4MarketingMedia[]) || []);
      }
    } catch (error) {
      console.error("Failed to load detail data:", error);
      toast.error("加载详情数据失败");
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  // 刷新项目数据
  const handleRefreshProject = async () => {
    if (!project?.id || isRefreshing) return;

    setIsRefreshing(true);
    try {
      const res = await refreshL4MarketingProjectAction(project.id);
      if (res.success) {
        toast.success("项目已刷新");
        await loadDetailData(project.id);
        onRefresh?.();
      } else {
        toast.error(res.error || "刷新失败");
      }
    } catch {
      toast.error("刷新失败");
    } finally {
      setIsRefreshing(false);
    }
  };

  // 当模态框打开时加载数据
  useEffect(() => {
    if (isOpen && project?.id) {
      loadDetailData(project.id);
    }
  }, [isOpen, project?.id, loadDetailData]);

  if (!project) return null;

  const projectStatus = project.project_status || "在途";
  const statusConfigItem = statusConfig[projectStatus] || {
    label: projectStatus,
    className: "bg-slate-100 text-slate-600",
  };

  const consultantName =
    project.consultant?.name ??
    consultants.find((c) => c.id === project.consultant_id)?.name ??
    "-";

  // 格式化价格
  const formatPrice = (value: number | undefined | null) => {
    if (value === undefined || value === null) return "-";
    return `¥${value.toLocaleString()}`;
  };

  // 格式化面积
  const formatArea = (value: number | undefined | null) => {
    if (value === undefined || value === null) return "-";
    return `${value.toLocaleString()} m²`;
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-3xl flex flex-col p-0 transition-all duration-300">
          <SheetTitle className="sr-only">营销项目详情 - {project.title}</SheetTitle>
          <SheetDescription className="sr-only">
            查看和管理营销项目 {project.title} 的详细信息
          </SheetDescription>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="shrink-0 -ml-2"
              >
                <X className="h-4 w-4" />
              </Button>
              <div>
                <div className="text-sm text-slate-500">营销项目详情</div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  {project.title || "未命名项目"}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshProject}
                disabled={isRefreshing}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                刷新
              </Button>
              <Button asChild size="sm">
                <Link href={`/minipro/projects/${project.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  编辑
                </Link>
              </Button>
            </div>
          </div>

          {/* Content */}
          <div
            className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hide"
            style={{ scrollbarGutter: "stable" }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* 左侧：主要信息 */}
                <div className="lg:col-span-7 space-y-6">
                  {/* 营销信息 */}
                  <InfoCard title="营销信息">
                    <div className="space-y-4">
                      <DisplayRow
                        label="营销标题"
                        value={
                          <span className="text-lg font-semibold text-slate-900">
                            {project.title || "-"}
                          </span>
                        }
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <DisplayRow label="物业风格" value={project.style || "-"} />
                        <DisplayRow label="排序权重" value={project.sort_order ?? 0} />
                      </div>
                      <DisplayRow
                        label="营销标签"
                        value={
                          typeof project.marketing_tags === "string" && project.marketing_tags ? (
                            <div className="flex flex-wrap gap-2">
                              {project.marketing_tags.split(",").map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="secondary"
                                  className="bg-slate-100 text-slate-700"
                                >
                                  {tag.trim()}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            "-"
                          )
                        }
                      />
                      <DisplayRow
                        label="项目描述"
                        value={
                          project.description ? (
                            <div className="whitespace-pre-wrap text-slate-600 leading-relaxed">
                              {project.description}
                            </div>
                          ) : (
                            "-"
                          )
                        }
                      />

                      <div className="pt-4 border-t border-slate-100">
                        <h3 className="text-sm font-semibold text-slate-800 mb-4">分享配置</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <DisplayRow label="分享标题" value={project.share_title || "-"} />
                          <DisplayRow
                            label="分享图"
                            value={
                              project.share_image ? (
                                <button
                                  onClick={() => setPreviewImage(getFileUrl(project.share_image!))}
                                  className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                                >
                                  查看图片
                                </button>
                              ) : (
                                "-"
                              )
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </InfoCard>

                  {/* 物理信息 */}
                  <InfoCard title="物理信息（只读）">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <DisplayRow label="关联主项目ID" value={project.project_id || "-"} />
                        <DisplayRow label="物业地址" value={project.address || "-"} />
                        <DisplayRow label="面积" value={formatArea(project.area)} />
                        <DisplayRow label="户型" value={project.layout || "-"} />
                        <DisplayRow label="朝向" value={project.orientation || "-"} />
                        <DisplayRow label="楼层信息" value={project.floor_info || "-"} />
                        <DisplayRow label="预估售价" value={formatPrice(project.price)} />
                      </div>
                    </div>
                  </InfoCard>
                </div>

                {/* 右侧：配置和照片 */}
                <div className="lg:col-span-5 space-y-6">
                  {/* 基础配置 */}
                  <InfoCard title="基础配置">
                    <div className="space-y-4">
                      <DisplayRow
                        label="封面图"
                        value={
                          project.cover_image ? (
                            <div className="flex items-center gap-3">
                              <img
                                src={getFileUrl(project.cover_image)}
                                alt="封面"
                                className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                              />
                              <button
                                onClick={() => setPreviewImage(getFileUrl(project.cover_image!))}
                                className="text-blue-600 hover:text-blue-700 underline underline-offset-2 text-sm"
                              >
                                查看原图
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">未设置封面</span>
                          )
                        }
                      />
                      <DisplayRow label="顾问" value={consultantName} />
                      <DisplayRow
                        label="发布状态"
                        value={
                          <Badge
                            variant="secondary"
                            className={
                              project.is_published
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }
                          >
                            {project.is_published ? "已发布" : "草稿"}
                          </Badge>
                        }
                      />
                      <DisplayRow
                        label="项目状态"
                        value={
                          <Badge variant="secondary" className={statusConfigItem.className}>
                            {statusConfigItem.label}
                          </Badge>
                        }
                      />
                      <DisplayRow label="浏览量" value={project.view_count ?? 0} />
                      <div className="pt-4 border-t border-slate-100">
                        <div className="grid grid-cols-1 gap-2 text-xs text-slate-500">
                          <div>发布时间: {project.published_at || "-"}</div>
                          <div>创建时间: {project.created_at || "-"}</div>
                          <div>更新时间: {project.updated_at || "-"}</div>
                        </div>
                      </div>
                    </div>
                  </InfoCard>

                  {/* 照片 */}
                  <InfoCard title="照片">
                    <PhotoGallery photos={photos} />
                    <div className="mt-4 text-xs text-slate-400">
                      如需管理照片（同步/删除/上传），请进入
                      <Link
                        href={`/minipro/projects/${project.id}/edit`}
                        className="text-blue-600 hover:text-blue-700 underline mx-1"
                      >
                        编辑页
                      </Link>
                      。
                    </div>
                  </InfoCard>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 图片预览对话框 */}
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
                sizes="(max-width: 896px) 100vw, 896px"
                priority
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
