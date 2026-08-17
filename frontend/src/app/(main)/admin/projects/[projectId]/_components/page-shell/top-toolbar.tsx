"use client";

import Link from "next/link";
import { ChevronLeft, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { formatRelativeTime } from "@/lib/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { Project } from "../../../types";
import type { ViewMode } from "../../../_components/project-detail/constants";

interface TopToolbarProps {
  project: Project;
  viewMode: ViewMode;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  /** 编辑 loading（V4.3 就地编辑后无预加载态，默认 false；保留兼容） */
  isEditLoading?: boolean;
}

/** ISO 日期 → 「YYYY.MM.DD」展示（已下架日期用；⚠️ 无专用下架字段，暂取 updated_at） */
function formatDotDate(value?: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, ".") : null;
}

/**
 * 顶部工具行（V4.1）：返回箭头 · 面包屑「项目列表 / 项目名」· 阶段状态文案 · 编辑 ✎ · 删除 🗑
 *
 * 按阶段分支：签约/装修/在售 = 绿点 +「更新于 {相对时间}」；
 * 已售 = 无绿点 +「已成交 · 归档完成」；已下架 = 无绿点 +「已下架 · {日期}」且隐藏编辑/删除。
 * <768px 桌面操作行隐藏，右侧改为「···」DropdownMenu 收纳编辑/删除（已下架不渲染）。
 * 权限控制与列表侧一致（HasPermission + PERMISSION_CODES），
 * 编辑弹窗与删除确认由编排器 project-detail-page-view.tsx 统一挂载。
 */
export function TopToolbar({
  project,
  viewMode,
  onBack,
  onEdit,
  onDelete,
  isEditLoading = false,
}: TopToolbarProps) {
  const isEnded = viewMode === "ended";
  // 已下架为终态归档，不提供编辑/删除（删除收口至视图内 danger-zone 卡）
  const canManage = !isEnded;
  const endedDate = formatDotDate(project.updated_at);

  return (
    <div className="flex items-center justify-between gap-4 pb-[18px] pt-1.5">
      <div className="flex min-w-0 items-center gap-2.5 text-sm text-graphite">
        <button
          type="button"
          onClick={onBack}
          aria-label="返回项目列表"
          title="返回项目列表"
          className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-[#e7e7ea] bg-pure-white text-ash transition-all hover:border-dove hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Link
          href="/admin/projects"
          className="shrink-0 font-[450] transition-colors hover:text-ink"
        >
          项目列表
        </Link>
        <span className="shrink-0 text-dove">/</span>
        <span className="truncate font-[480] text-ink">{project.name}</span>
      </div>

      {/* 桌面（≥768px）操作行 */}
      <div className="hidden shrink-0 items-center gap-1 md:flex">
        {isEnded ? (
          <span className="mr-2.5 text-[13px] text-graphite">
            已下架{endedDate ? ` · ${endedDate}` : ""}
          </span>
        ) : viewMode === "sold" ? (
          <span className="mr-2.5 text-[13px] text-graphite">已成交 · 归档完成</span>
        ) : (
          <span className="mr-2.5 inline-flex items-center gap-1.5 text-[13px] text-graphite">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7fb58a]" aria-hidden />
            更新于 {formatRelativeTime(project.updated_at)}
          </span>
        )}

        {canManage && (
          <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
            <button
              type="button"
              onClick={onEdit}
              disabled={isEditLoading}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-sm font-[450] text-ink transition-colors hover:bg-[#ededf0] disabled:opacity-60"
            >
              {isEditLoading ? (
                <Loader2 className="h-[15px] w-[15px] animate-spin" />
              ) : (
                <Pencil className="h-[15px] w-[15px]" />
              )}
              编辑
            </button>
          </HasPermission>
        )}

        {canManage && (
          <HasPermission code={PERMISSION_CODES.PROJECT_DELETE}>
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-sm font-[450] text-rust transition-colors hover:bg-[#fdf4ef]"
            >
              <Trash2 className="h-[15px] w-[15px]" />
              删除
            </button>
          </HasPermission>
        )}
      </div>

      {/* 移动端（<768px）「···」菜单收纳编辑/删除（已下架不渲染） */}
      {canManage && (
        <div className="shrink-0 md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="更多操作"
              title="更多操作"
              className="grid h-9 w-9 place-items-center rounded-full border border-[#e7e7ea] bg-pure-white text-ash transition-colors hover:border-dove hover:text-ink"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
                <DropdownMenuItem disabled={isEditLoading} onSelect={() => onEdit()}>
                  {isEditLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pencil className="h-4 w-4" />
                  )}
                  编辑
                </DropdownMenuItem>
              </HasPermission>
              <HasPermission code={PERMISSION_CODES.PROJECT_DELETE}>
                <DropdownMenuItem variant="destructive" onSelect={() => onDelete()}>
                  <Trash2 className="h-4 w-4" />
                  删除
                </DropdownMenuItem>
              </HasPermission>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
