"use client";

import { useState } from "react";
import { PowerOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Project } from "../../../../types";
import { updateProjectStatusAction } from "../../../../actions/client";
import { ListingKPIs } from "./kpi";
import { SellingBasicInfo } from "./basic-info";
import { SalesTeamPanel } from "./team-panel";
import { ActivityTabs } from "./activity-tabs";
import { DealDialog } from "./deal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface SellingViewProps {
  project: Project;
  onRefresh?: () => void;
  onDealSuccess?: () => Promise<void>;
}

export function SellingView({ project, onRefresh, onDealSuccess }: SellingViewProps) {
  const [isEnding, setIsEnding] = useState(false);

  const handleEndProject = async () => {
    setIsEnding(true);
    try {
      const res = await updateProjectStatusAction(project.id, "ended");
      if (res.success) {
        toast.success("项目已结束");
        onRefresh?.();
      } else {
        toast.error(res.message || "操作失败");
      }
    } catch {
      toast.error("操作失败");
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <div className="relative pb-24 animate-in fade-in slide-in-from-right-4 duration-300">
      {/* 0. 基础信息概览 */}
      <SellingBasicInfo project={project} onRefresh={onRefresh} />

      {/* 1. 顶部 KPI 看板 */}
      <ListingKPIs project={project} />

      {/* 2. 销售团队录入 */}
      <SalesTeamPanel project={project} />

      {/* 3. 核心记录 Tabs */}
      <ActivityTabs project={project} onRefresh={onRefresh} />

      {/* 4. 底部固定操作栏 */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] left-0 right-0 z-10 flex items-center justify-between border-t border-border bg-card p-4 md:absolute md:bottom-0 md:rounded-b-xl shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">当前状态</span>
          <Badge
            variant="secondary"
            className="bg-success-container text-emerald-700 hover:bg-emerald-100 border-none"
          >
            在售中
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* 结束项目 */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-300 text-orange-600 hover:bg-orange-50 hover:text-orange-700"
              >
                <PowerOff className="mr-2 h-4 w-4" />
                结束项目
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认结束项目？</AlertDialogTitle>
                <AlertDialogDescription>
                  结束后项目将进入已下架状态，不可恢复为在售。此操作适用于委托到期未售出的房屋。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleEndProject();
                  }}
                  disabled={isEnding}
                  className="bg-orange-600 hover:bg-orange-700 focus:ring-orange-500"
                >
                  {isEnding ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  确认结束
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* 确认成交 - 覆盖默认按钮样式为翠绿色 */}
          <div className="w-[180px] [&_button]:bg-success [&_button]:hover:brightness-95 [&_button]:text-white">
            <DealDialog project={project} onSuccess={onDealSuccess} />
          </div>
        </div>
      </div>
    </div>
  );
}
