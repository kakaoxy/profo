"use client";

import { Button } from "@/components/ui/button";
import { Pencil, X, RefreshCw } from "lucide-react";
import Link from "next/link";
import type { MarketingDetailHeaderProps } from "./types";

export function MarketingDetailHeader({
  project,
  isRefreshing,
  onClose,
  onRefresh,
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
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
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
  );
}
