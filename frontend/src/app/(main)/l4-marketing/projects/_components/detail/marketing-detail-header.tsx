"use client";

import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pencil,
  Eye,
  MoreVertical,
} from "lucide-react";
import Link from "next/link";
import type { MarketingDetailHeaderProps } from "./types";

// 使用 memo 避免不必要的重渲染
export const MarketingDetailHeader = memo(function MarketingDetailHeader({
  project,
  onClose,
}: MarketingDetailHeaderProps) {
  return (
    <div className="px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div className="flex items-center justify-between gap-4">
        {/* 左侧：返回按钮和标题 */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="shrink-0 -ml-2 h-8 w-8"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">
              {project.title || "未命名项目"}
            </h1>
            {project.community_name ? (
              <span className="text-slate-400 text-sm">
                · {project.community_name}
              </span>
            ) : null}
            <span className="text-slate-400 text-sm">
              (ID:{project.id})
            </span>
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2">
          <Link
            href={`/l4-marketing/projects/${project.id}/edit`}
            onClick={(e) => {
              onClose();
            }}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-8"
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              编辑房源
            </Button>
          </Link>

          <Link
            href={`/l4-marketing/projects/${project.id}/preview`}
            target="_blank"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <Button
              variant="outline"
              size="sm"
              className="h-8"
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              预览
            </Button>
          </Link>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
});
