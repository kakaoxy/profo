"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Pencil, Eye, MoreVertical } from "lucide-react";
import Link from "next/link";
import type { MarketingDetailHeaderProps } from "./types";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

// 使用 memo 避免不必要的重渲染
export const MarketingDetailHeader = memo(function MarketingDetailHeader({
  project,
  onClose,
  mode = "view",
  onStartEdit,
}: MarketingDetailHeaderProps) {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.L4_MARKETING_WRITE);

  return (
    <div className="sticky top-0 z-10 border-b border-dove/40 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        {/* 左侧：返回按钮和标题 */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 -ml-2 h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg text-ink leading-tight">
              {project.title || "未命名项目"}
            </h1>
            {project.community_name ? (
              <span className="text-xs text-graphite">· {project.community_name}</span>
            ) : null}
            <span className="text-xs text-graphite">(ID:{project.id})</span>
          </div>
        </div>

        {/* 右侧：操作按钮（view 态：编辑房源/预览；edit 态：提示，保存/取消在表单 sticky 底栏） */}
        <div className="flex items-center gap-2">
          {mode === "view" && canWrite ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-white text-ink border-dove hover:bg-fog"
              onClick={() => onStartEdit?.()}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              编辑房源
            </Button>
          ) : null}

          {mode === "view" && (
            <Link
              href={`/projects/${project.id}`}
              target="_blank"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-white text-ink border-dove hover:bg-fog"
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                预览
              </Button>
            </Link>
          )}

          {mode === "edit" && (
            <span className="text-xs text-graphite">编辑中 · 保存/取消在底部</span>
          )}

          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
