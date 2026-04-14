"use client";

import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Pencil, 
  X, 
  Clock,
  ArrowLeft,
  Share2
} from "lucide-react";
import Link from "next/link";
import { formatDate, getRelativeTime, getStatusConfig, getPublishStatusConfig } from "./utils";
import type { MarketingDetailHeaderProps } from "./types";

// 使用 memo 避免不必要的重渲染
export const MarketingDetailHeader = memo(function MarketingDetailHeader({
  project,
  onClose,
}: MarketingDetailHeaderProps) {
  const statusConfig = getStatusConfig(project.project_status || "在途");
  const publishConfig = getPublishStatusConfig(project.publish_status || "草稿");

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
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                {project.title || "未命名项目"}
              </h1>
              
              {/* 状态标签组 */}
              <div className="flex items-center gap-1.5">
                <Badge 
                  className={`${statusConfig.className} text-[10px] px-2 py-0 h-5 border-0`}
                >
                  {statusConfig.label}
                </Badge>
                <Badge 
                  className={`${publishConfig.className} text-[10px] px-2 py-0 h-5 border-0`}
                >
                  {publishConfig.label}
                </Badge>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-3 w-3" />
              <span>创建于 {formatDate(project.created_at)}</span>
              <span className="text-slate-300">({getRelativeTime(project.created_at)})</span>
            </div>
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="h-8"
            asChild
          >
            <Link 
              href={`/l4-marketing/projects/${project.id}/edit`}
              onClick={(e) => {
                onClose();
              }}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              编辑
            </Link>
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* 小区名称副标题 */}
      {project.community_name && (
        <div className="mt-2 ml-8 flex items-center gap-1.5 text-sm text-slate-500">
          <Share2 className="h-3 w-3" />
          <span>{project.community_name}</span>
        </div>
      )}
    </div>
  );
});
