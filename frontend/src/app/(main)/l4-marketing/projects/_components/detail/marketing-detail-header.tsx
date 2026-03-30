"use client";

import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";
import Link from "next/link";
import type { MarketingDetailHeaderProps } from "./types";

export function MarketingDetailHeader({
  project,
  onClose,
}: MarketingDetailHeaderProps) {
  return (
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
        <Button asChild size="sm">
          <Link 
            href={`/l4-marketing/projects/${project.id}/edit`}
            onClick={(e) => {
              // 关闭详情页后再跳转
              onClose();
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            编辑
          </Link>
        </Button>
      </div>
    </div>
  );
}
