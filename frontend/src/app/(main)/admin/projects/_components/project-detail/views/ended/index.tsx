"use client";

import { useState } from "react";
import { Trash2, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
import { InfoCard as InfoSection, InfoItem } from "@/components/common";
import { Project } from "../../../../types";
import { formatDate, formatPrice } from "../../utils";
import { getProjectStatusClassName } from "@/lib/status-colors";
import { deleteProjectAction } from "../../../../actions/core";

interface EndedViewProps {
  project: Project;
  onClose: () => void;
}

export function EndedView({ project, onClose }: EndedViewProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteProjectAction(project.id);
      if (res.success) {
        toast.success("项目已删除");
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const commissionRange =
    project.commission_start_date || project.commission_end_date
      ? `${formatDate(project.commission_start_date)} 至 ${formatDate(project.commission_end_date)}`
      : undefined;

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* 顶部 Header：项目名 + 已下架徽标 + 删除按钮 */}
      <div className="border-b bg-background px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">
                {project.name}
              </h1>
              <Badge className={getProjectStatusClassName(project.status)}>
                已下架
              </Badge>
            </div>
            {project.community_name && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>
                  {project.community_name} {project.address}
                </span>
              </div>
            )}
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="mr-2 h-4 w-4" />
                删除项目
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                <AlertDialogDescription>
                  此操作将把项目标记为删除状态。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete();
                  }}
                  disabled={isDeleting}
                  className="bg-error hover:bg-red-700 focus:ring-red-600"
                >
                  {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* 基础信息卡片 */}
          <InfoSection title="基础信息" icon={<MapPin className="h-4 w-4" />}>
            <InfoItem label="小区名称" value={project.community_name} />
            <InfoItem
              label="建筑面积"
              value={project.area ? `${project.area} ㎡` : undefined}
            />
            <InfoItem
              label="详细地址"
              value={project.address}
              className="sm:col-span-2"
            />
            <InfoItem
              label="挂牌价"
              value={formatPrice(project.list_price)}
              highlight
            />
            <InfoItem
              label="签约价"
              value={formatPrice(project.signing_price)}
            />
          </InfoSection>

          {/* 关键日期卡片 */}
          <InfoSection title="关键日期" icon={<MapPin className="h-4 w-4" />}>
            <InfoItem
              label="挂牌日期"
              value={formatDate(project.listing_date)}
            />
            <InfoItem
              label="签约日期"
              value={formatDate(project.signing_date)}
            />
            <InfoItem
              label="委托期限"
              value={commissionRange}
              className="sm:col-span-2"
            />
          </InfoSection>

          {/* 下架说明 */}
          <Card className="border-dashed">
            <CardContent className="px-4 py-3">
              <p className="text-sm text-muted-foreground">
                该项目已结束销售，不可恢复为在售状态。
              </p>
            </CardContent>
          </Card>

          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
