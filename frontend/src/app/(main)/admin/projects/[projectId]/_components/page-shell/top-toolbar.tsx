"use client";

import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
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
  /** 归档入口（仅 sold/ended 且未归档时由编排器提供） */
  onArchive?: () => void;
  /** 反归档入口（已归档时由编排器提供） */
  onUnarchive?: () => void;
  /** 编辑 loading（V4.3 就地编辑后无预加载态，默认 false；保留兼容） */
  isEditLoading?: boolean;
}

/** ISO 日期 → 「YYYY.MM.DD」展示（已下架日期用；⚠️ 无专用下架字段，暂取 updated_at） */
function formatDotDate(value?: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, ".") : null;
}

/** 归档日期 ISO → 「YYYY.MM.DD」 */
function formatArchivedDate(value?: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, ".") : null;
}

/**
 * 顶部工具行（V4.1）：返回箭头 · 面包屑「项目列表 / 项目名」· 阶段状态文案 · 归档状态 · 编辑 ✎ · 删除 🗑
 *
 * 按阶段分支：签约/装修/在售 = 绿点 +「更新于 {相对时间}」；
 * 已售 = 无绿点 +「已成交」；已下架 = 无绿点 +「已下架 · {日期}」且隐藏编辑/删除。
 * 归档（独立于生命周期状态）：
 * - 未归档且 sold/ended → 显示「归档」按钮；
 * - 已归档 → 状态文案追加「已归档 · {归档日期}」，编辑置灰、删除隐藏，显示「反归档」。
 * <768px 桌面操作行隐藏，右侧改为「···」DropdownMenu 收纳（已下架仅保留归档入口）。
 */
export function TopToolbar({
  project,
  viewMode,
  onBack,
  onEdit,
  onDelete,
  onArchive,
  onUnarchive,
  isEditLoading = false,
}: TopToolbarProps) {
  const isEnded = viewMode === "ended";
  // 归档态单一判据（后端写锁与本判据一一对应）
  const isArchived = project.is_archived === true;
  // 已下架为终态归档，不提供编辑/删除（删除收口至视图内 danger-zone 卡）
  const canManage = !isEnded && !isArchived;
  const endedDate = formatDotDate(project.updated_at);
  const archivedDate = formatArchivedDate(project.archived_at);
  // 仅已售 / 已下架可归档：消费后端派生字段 can_archive（权威源 ARCHIVABLE_STATUSES，前后端同源）
  const canArchive = project.can_archive === true && !isArchived;
  // 已归档项目的唯一写入口 = 反归档
  const showUnarchive = isArchived;

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
          <span className="mr-2.5 text-[13px] text-graphite">已成交</span>
        ) : (
          <span className="mr-2.5 inline-flex items-center gap-1.5 text-[13px] text-graphite">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7fb58a]" aria-hidden />
            更新于 {formatRelativeTime(project.updated_at)}
          </span>
        )}

        {/* 归档状态文案（锁形徽标语义，与 Hero pill 旁徽章一致） */}
        {isArchived && (
          <span className="mr-2.5 inline-flex items-center gap-1 rounded-full bg-fog px-[10px] py-[4px] text-[12px] font-[450] text-ash">
            <Archive className="h-3 w-3" />
            已归档{archivedDate ? ` · ${archivedDate}` : ""}
          </span>
        )}

        {canArchive && onArchive && (
          <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
            <button
              type="button"
              onClick={onArchive}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-sm font-[450] text-ink transition-colors hover:bg-[#ededf0]"
            >
              <Archive className="h-[15px] w-[15px]" />
              归档
            </button>
          </HasPermission>
        )}

        {showUnarchive && onUnarchive && (
          <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
            <button
              type="button"
              onClick={onUnarchive}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-[7px] text-sm font-[450] text-rust transition-colors hover:bg-[#fdf4ef]"
            >
              <ArchiveRestore className="h-[15px] w-[15px]" />
              反归档
            </button>
          </HasPermission>
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

        {/* 已归档项目：编辑置灰（提示先反归档），删除隐藏 */}
        {isArchived && (
          <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
            <button
              type="button"
              disabled
              title="项目已归档，请先反归档后再编辑"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full px-3 py-[7px] text-sm font-[450] text-dove opacity-60"
            >
              <Pencil className="h-[15px] w-[15px]" />
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

      {/* 移动端（<768px）「···」菜单收纳（已下架仅保留归档入口；已归档仅保留反归档） */}
      {(canManage || canArchive || showUnarchive) && (
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
              {canArchive && onArchive && (
                <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
                  <DropdownMenuItem onSelect={() => onArchive()}>
                    <Archive className="h-4 w-4" />
                    归档
                  </DropdownMenuItem>
                </HasPermission>
              )}
              {showUnarchive && onUnarchive && (
                <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
                  <DropdownMenuItem onSelect={() => onUnarchive()}>
                    <ArchiveRestore className="h-4 w-4" />
                    反归档
                  </DropdownMenuItem>
                </HasPermission>
              )}
              {canManage && (
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
              )}
              {canManage && (
                <HasPermission code={PERMISSION_CODES.PROJECT_DELETE}>
                  <DropdownMenuItem variant="destructive" onSelect={() => onDelete()}>
                    <Trash2 className="h-4 w-4" />
                    删除
                  </DropdownMenuItem>
                </HasPermission>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
