"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Plus, Inbox, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecruitCampaign, RecruitEmployee } from "../../types";
import { CampaignsTable } from "./campaigns-table";
import type { CampaignFormData } from "./campaign-form-dialog";
import {
  createCampaignAction,
  updateCampaignAction,
  toggleCampaignStatusAction,
  deleteCampaignAction,
  generateCampaignQRCodeAction,
  type CampaignFormData as ActionCampaignFormData,
} from "../../_lib/recruit-actions";
import { RecruitKpiGrid, type RecruitKpiItem } from "../../_components/recruit-kpi";
import { DesignPagination } from "../../_components/design-pagination";

// 动态导入弹窗组件（ssr: false，仅在客户端加载）
const CampaignFormDialog = dynamic(
  () =>
    import("./campaign-form-dialog").then((m) => m.CampaignFormDialog),
  { ssr: false },
);

/** 活动页 KPI 概览统计（由 page.tsx 服务端计算后传入；进行中/总数由列表状态实时计算） */
export interface CampaignStats {
  /** 累计分享次数（近 30 天漏斗） */
  shared: number;
  /** 累计有效留资（近 30 天漏斗） */
  authed: number;
  /** 整体转化率（有效新客 ÷ 分享次数） */
  conversion: number;
  sharedTrend: { text: string; tone: "up" | "down" } | null;
  authedTrend: { text: string; tone: "up" | "down" } | null;
  conversionTrend: { text: string; tone: "up" | "down" } | null;
}

interface CampaignsViewProps {
  /** 服务端获取的活动列表（revalidatePath 后自动刷新） */
  campaigns: RecruitCampaign[];
  /** 页面头部 KPI 概览统计 */
  stats: CampaignStats;
  /** 员工列表（小程序码归属员工选择） */
  employees: RecruitEmployee[];
}

/**
 * 活动配置列表视图：增删改通过 Server Actions 调用后端接口，
 * 成功后 revalidatePath 刷新列表数据（props 由 Server Component 重新传入）。
 * 布局与视觉对齐设计稿（Steep）：页头 + KPI 概览 + 活动列表卡。
 */
export function CampaignsView({ campaigns, stats, employees }: CampaignsViewProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCampaign, setEditingCampaign] =
    React.useState<RecruitCampaign | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  // 小程序码弹窗状态
  const [qrDialogOpen, setQrDialogOpen] = React.useState(false);
  const [qrCampaign, setQrCampaign] = React.useState<RecruitCampaign | null>(null);
  const [qrEmployeeId, setQrEmployeeId] = React.useState<string>("");
  const [qrGenerating, setQrGenerating] = React.useState(false);
  const [qrResult, setQrResult] = React.useState<{ code: string; image_base64: string } | null>(null);

  // KPI 概览（与列表状态联动：停用/启用后「进行中」实时变化）
  const kpiItems: RecruitKpiItem[] = React.useMemo(() => {
    const enabled = campaigns.filter((c) => c.status === "enabled").length;
    return [
      {
        dotClass: "bg-ink",
        label: "进行中活动",
        value: String(enabled),
        trend: { text: `共创建 ${campaigns.length} 个` },
      },
      {
        dotClass: "bg-graphite",
        label: "累计分享次数",
        value: stats.shared.toLocaleString(),
        trend: stats.sharedTrend ?? { text: "近 30 天" },
      },
      {
        dotClass: "bg-rust",
        label: "累计有效留资",
        value: stats.authed.toLocaleString(),
        trend: stats.authedTrend ?? { text: "近 30 天" },
      },
      {
        dotClass: "bg-apricot-wash",
        label: "整体转化率",
        value: `${stats.conversion.toFixed(1)}%`,
        trend: stats.conversionTrend ?? { text: "近 30 天" },
      },
    ];
  }, [campaigns, stats]);

  // 新建活动
  const handleCreate = async (data: CampaignFormData) => {
    setSubmitting(true);
    try {
      const result = await createCampaignAction(data as ActionCampaignFormData);
      if (result.success) {
        toast.success("活动创建成功");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 编辑活动
  const handleEdit = async (campaign: RecruitCampaign, data: CampaignFormData) => {
    setSubmitting(true);
    try {
      const result = await updateCampaignAction(
        campaign.id,
        data as ActionCampaignFormData,
      );
      if (result.success) {
        toast.success("活动更新成功");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 启用 / 停用（设计稿行内「停用/启用」文本操作）
  const handleToggleStatus = async (campaign: RecruitCampaign) => {
    const nextStatus: RecruitCampaign["status"] =
      campaign.status === "enabled" ? "disabled" : "enabled";
    setTogglingId(campaign.id);
    try {
      const result = await toggleCampaignStatusAction(campaign.id, nextStatus);
      if (result.success) {
        toast.success(nextStatus === "enabled" ? "活动已启用" : "活动已停用");
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setTogglingId(null);
    }
  };

  // 小程序码
  const handleQr = (campaign: RecruitCampaign) => {
    setQrCampaign(campaign);
    setQrEmployeeId("");
    setQrResult(null);
    setQrDialogOpen(true);
  };

  const handleGenerateQr = async () => {
    if (!qrCampaign) return;
    setQrGenerating(true);
    try {
      const result = await generateCampaignQRCodeAction(
        qrCampaign.id,
        qrEmployeeId || undefined,
      );
      if (result.success) {
        setQrResult(result.data);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setQrGenerating(false);
    }
  };

  const handleDownloadQr = () => {
    if (!qrResult) return;
    const link = document.createElement("a");
    link.download = `qrcode-${qrResult.code}.png`;
    link.href = `data:image/png;base64,${qrResult.image_base64}`;
    link.click();
  };

  // 删除活动（存在关联线索时后端拒绝，引导改用停用）
  const handleDelete = async (campaign: RecruitCampaign) => {
    return deleteCampaignAction(campaign.id);
  };

  // 导出（占位：二期接入真实导出接口）
  const handleExport = () => {
    toast("导出活动列表二期接入");
  };

  const openCreateDialog = () => {
    setEditingCampaign(null);
    setDialogOpen(true);
  };

  const openEditDialog = (campaign: RecruitCampaign) => {
    setEditingCampaign(campaign);
    setDialogOpen(true);
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* 页头：标题 + 描述 + 新建按钮 */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.23px] text-ink">
              招募活动
            </h1>
            <p className="mt-1.5 text-[15px] text-graphite">
              配置分享素材，员工分享时统一采用此配置，不可自定义
            </p>
          </div>
          <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
            <Button
              className="h-9 px-5 rounded-full bg-ink text-white text-[15px] font-medium hover:bg-black shrink-0 self-start sm:self-auto"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              新建活动
            </Button>
          </HasPermission>
        </div>

        {/* KPI 概览 */}
        <RecruitKpiGrid items={kpiItems} />

        {/* 活动列表卡 */}
        <div className="bg-white rounded-cards shadow-steep overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-fog">
            <div>
              <div className="text-[15px] font-medium text-ink">活动列表</div>
              <div className="mt-0.5 text-[13px] text-graphite">
                共 {campaigns.length} 个活动
              </div>
            </div>
            <button
              type="button"
              className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
              onClick={handleExport}
            >
              导出
            </button>
          </div>

          {campaigns.length > 0 ? (
            <>
              <CampaignsTable
                campaigns={campaigns}
                onEdit={openEditDialog}
                onToggleStatus={handleToggleStatus}
                onQr={handleQr}
                onDelete={handleDelete}
                togglingId={togglingId}
              />
              <DesignPagination
                info={`共 ${campaigns.length} 条记录`}
                page={1}
                totalPages={1}
              />
            </>
          ) : (
            <EmptyState
              icon={<Inbox className="h-12 w-12" />}
              title="暂无活动"
              description="点击右上角「新建活动」创建第一个招募活动"
            />
          )}
        </div>
      </div>

      {dialogOpen && (
        <CampaignFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          campaign={editingCampaign}
          submitting={submitting}
          onSubmit={
            editingCampaign
              ? (data) => handleEdit(editingCampaign, data)
              : handleCreate
          }
        />
      )}

      {/* 小程序码弹窗 */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent showCloseButton={false} className="sm:max-w-100 rounded-cards p-0 gap-0 bg-white">
          <DialogHeader className="flex flex-row items-center justify-between px-6 py-5 border-b border-fog text-left">
            <DialogTitle className="text-base font-medium text-ink">
              小程序码 - {qrCampaign?.name ?? ""}
            </DialogTitle>
            <button
              type="button"
              onClick={() => setQrDialogOpen(false)}
              className="h-8 w-8 rounded-full flex items-center justify-center text-slate text-[15px] hover:bg-fog hover:text-ink transition-colors"
              aria-label="关闭"
            >
              ✕
            </button>
          </DialogHeader>

          <div className="px-6 py-5 space-y-4">
            {!qrResult ? (
              <>
                <div className="flex flex-col gap-2">
                  <label className="text-[14px] font-medium text-ink">
                    归属员工（可选）
                  </label>
                  <Select
                    value={qrEmployeeId}
                    onValueChange={setQrEmployeeId}
                  >
                    <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px]">
                      <SelectValue placeholder="不绑定员工" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">不绑定员工</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={handleGenerateQr}
                  disabled={qrGenerating}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-full bg-ink text-white text-[14px] font-medium hover:bg-black transition-colors disabled:opacity-50 w-full"
                >
                  {qrGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
                  生成小程序码
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="relative w-48 h-48 rounded-images overflow-hidden border border-fog">
                  <Image
                    src={`data:image/png;base64,${qrResult.image_base64}`}
                    alt="小程序码"
                    fill
                    className="object-contain"
                    sizes="192px"
                    unoptimized
                  />
                </div>
                <p className="text-[12.5px] text-slate text-center">
                  短码: {qrResult.code}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-full bg-ink text-white text-[14px] font-medium hover:bg-black transition-colors"
                >
                  <Download className="h-4 w-4" />
                  下载小程序码
                </button>
                <button
                  type="button"
                  onClick={() => setQrResult(null)}
                  className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
                >
                  重新生成
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
