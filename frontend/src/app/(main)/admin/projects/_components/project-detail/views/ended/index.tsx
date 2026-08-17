"use client";

import { useState } from "react";
import { Trash2, Loader2, MapPin, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
  /** 页面级删除弹窗触发（未提供时降级为视图内 AlertDialog，兼容抽屉场景） */
  onDelete?: () => void;
}

export function EndedView({ project, onClose, onDelete }: EndedViewProps) {
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

  // 删除项目按钮：白底描边胶囊（文字/图标 rust，边框 #e5c4b5）
  const deleteTriggerButton = (
    <button
      type="button"
      onClick={onDelete}
      disabled={isDeleting}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e5c4b5] bg-white px-3.5 py-1.5 text-[13.5px] font-[450] text-rust transition-colors hover:border-rust hover:bg-[#fdf4ef] disabled:opacity-60"
    >
      {isDeleting ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Trash2 className="h-3.5 w-3.5" />
      )}
      删除项目
    </button>
  );

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* 顶部 Header：项目名 + 已下架徽标（删除入口已迁至 danger-zone 卡） */}
      <div className="border-b bg-background px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">{project.name}</h1>
              <Badge className={getProjectStatusClassName(project.status)}>已下架</Badge>
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
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
          {/* 下架提示卡 */}
          <div className="rounded-cards border border-dashed border-dove bg-[#fdfdfd] p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fog text-graphite">
                <Info className="h-[17px] w-[17px]" />
              </span>
              <div>
                <div className="text-[15px] font-[500] text-ink">该项目已结束销售</div>
                <p className="mt-1 text-sm font-[430] leading-relaxed text-ash">
                  适用于委托到期未售出的房屋。项目不可恢复为在售状态，可保留查阅或删除。
                </p>
              </div>
            </div>
          </div>

          {/* 基础信息卡片 */}
          <InfoSection title="基础信息" icon={<MapPin className="h-4 w-4" />}>
            <InfoItem label="小区名称" value={project.community_name} />
            <InfoItem label="建筑面积" value={project.area ? `${project.area} ㎡` : undefined} />
            <InfoItem label="详细地址" value={project.address} className="sm:col-span-2" />
            <InfoItem label="挂牌价" value={formatPrice(project.list_price)} highlight />
            <InfoItem label="签约价" value={formatPrice(project.signing_price)} />
          </InfoSection>

          {/* 关键日期卡片 */}
          <InfoSection title="关键日期" icon={<MapPin className="h-4 w-4" />}>
            <InfoItem label="挂牌日期" value={formatDate(project.listing_date)} />
            <InfoItem label="签约日期" value={formatDate(project.signing_date)} />
            <InfoItem label="委托期限" value={commissionRange} className="sm:col-span-2" />
          </InfoSection>

          {/* 危险操作卡：onDelete 未提供时降级为视图内删除确认（抽屉场景） */}
          <div className="rounded-cards border border-[#f0dcd2] bg-[#fdf9f6] p-6">
            <div className="mb-2 flex items-center gap-2 text-base font-[500] text-rust">
              <AlertTriangle className="h-4 w-4" />
              危险操作
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm font-[430] text-ash">删除后项目进入回收状态，仅管理员可见。</p>
              {onDelete ? (
                deleteTriggerButton
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>{deleteTriggerButton}</AlertDialogTrigger>
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
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
