"use client";

import { memo, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Eye, Pencil, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { DeleteConfirmButton } from "@/components/common";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { safeFormatDate } from "@/lib/formatters";
import type { MarketingDetailHeaderProps } from "./types";

function StatusPill({ children, tone = "fog" }: { children: ReactNode; tone?: "fog" | "rust" | "ink" }) {
  const toneClass =
    tone === "rust"
      ? "bg-rust text-white"
      : tone === "ink"
        ? "bg-ink text-white"
        : "bg-fog text-graphite";
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[11px] font-medium ${toneClass}`}>
      {children}
    </span>
  );
}

/** 营销房源详情页页头：档案标题 + 状态 + 页面级操作。 */
export const MarketingDetailHeader = memo(function MarketingDetailHeader({
  project,
  onClose,
  mode = "view",
  onStartEdit,
  onDelete,
}: MarketingDetailHeaderProps) {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  const published = project.publish_status === "发布";
  const viewCount = project.view_summary?.view_count;
  const isEdit = mode === "edit";

  return (
    <div className="border-b border-dove/30 bg-fog/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1200px] px-4 pb-6 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 text-[11px] text-graphite transition-colors hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">返回营销列表</span>
          </button>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {mode === "view" && (
              <>
                <Link
                  href={`/projects/${project.id}`}
                  target="_blank"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full border-dove bg-white text-ink hover:bg-fog"
                  >
                    <Eye className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">预览</span>
                  </Button>
                </Link>
                {canWrite ? (
                  <Button
                    size="sm"
                    className="h-9 rounded-full bg-ink px-4 text-white hover:bg-ink/90"
                    onClick={() => onStartEdit?.()}
                  >
                    <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                    <span className="hidden sm:inline">编辑房源</span>
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-full border-dove bg-white text-ink hover:bg-fog"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      toast.success("详情链接已复制");
                    } catch {
                      toast.error("复制失败，请手动复制地址栏链接");
                    }
                  }}
                >
                  <Share2 className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">分享</span>
                </Button>
                {canWrite && onDelete ? (
                  <DeleteConfirmButton
                    onDelete={onDelete}
                    itemName={project.title}
                    description="删除后该房源将从营销列表与客户端展示中移除，此操作不可撤销。"
                    label="删除"
                    className="border border-dove bg-white text-error hover:bg-error-container hover:text-error"
                  />
                ) : null}
              </>
            )}
            {mode === "edit" ? (
              <span className="text-[11px] text-graphite">编辑中 · 保存/取消在表单底部</span>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex items-center gap-1.5 text-[11px] text-graphite">
          <span>营销中心</span>
          <ChevronRight className="h-3 w-3 text-dove" />
          <span>营销项目</span>
          <ChevronRight className="h-3 w-3 text-dove" />
          <span className="text-ash">{project.community_name || "房源详情"}</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="h-px w-7 bg-rust" />
          <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-graphite">
            {isEdit ? (
              <>
                房源编辑室 <span className="text-dove">/</span> Edit listing
              </>
            ) : (
              <>
                房源档案 <span className="text-dove">/</span> Listing dossier · {project.id}
              </>
            )}
          </span>
        </div>

        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="page-title text-[32px] leading-[1.12] text-ink sm:text-[44px] sm:leading-[1.08]">
              {isEdit ? "编辑房源" : project.title || "未命名房源"}
            </h1>
            <p className="mt-2 text-[13px] text-graphite">
              {isEdit
                ? `${project.title || "未命名房源"} · ID ${project.id} · 最后保存 ${safeFormatDate(project.updated_at, "MM.dd HH:mm")}`
                : [project.community_name, project.building_no, project.room_no, project.layout, project.area ? `${project.area}㎡` : null]
                    .filter(Boolean)
                    .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone={published ? "rust" : "fog"}>{published ? "已发布" : "草稿"}</StatusPill>
            <StatusPill tone={project.project_status === "在售" ? "ink" : "fog"}>
              {project.project_status || "在途"}
            </StatusPill>
            {project.is_new_listing ? <StatusPill>新上</StatusPill> : null}
            {viewCount !== undefined ? <StatusPill>{viewCount.toLocaleString()} 次浏览</StatusPill> : null}
            <span className="ml-1 text-[11px] text-dove">
              更新于 {safeFormatDate(project.updated_at, "MM.dd HH:mm")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});
