"use client";

import * as React from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { Plus, Inbox, Rocket, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GrowthCampaign, GrowthCampaignStats, GrowthEmployee } from "../../_lib/campaign-data";
import { PhaseTag2 } from "../../_components/phase-tag";
import { CampaignsTable } from "./campaigns-table";
import type { CampaignFormData } from "./campaign-form-dialog";
import {
  createCampaignAction,
  updateCampaignAction,
  toggleCampaignStatusAction,
  deleteCampaignAction,
  generateCampaignQRCodeAction,
  type CampaignFormData as ActionCampaignFormData,
} from "../../_lib/campaign-actions";
import { RecruitKpiGrid, type RecruitKpiItem } from "../../_components/recruit-kpi";
import { DesignPagination } from "../../_components/design-pagination";

// 动态导入弹窗组件（ssr: false，仅在客户端加载）
const CampaignFormDialog = dynamic(
  () => import("./campaign-form-dialog").then((m) => m.CampaignFormDialog),
  { ssr: false },
);

/** 活动类型 Tab（一期仅招募可交互，其余为二期预留空态，客户端切换不涉及 URL） */
type CampaignTab = "recruit" | "valuation" | "booking" | "sheet";

const CAMPAIGN_TABS: ReadonlyArray<{ value: CampaignTab; label: string; phase2: boolean }> = [
  { value: "recruit", label: "招募活动", phase2: false },
  { value: "valuation", label: "估价推广", phase2: true },
  { value: "booking", label: "房源推广", phase2: true },
  { value: "sheet", label: "房源单推广", phase2: true },
];

/** Tab 药丸按钮样式（对齐设计稿 .tab） */
function tabClass(active: boolean): string {
  return [
    "h-[38px] px-[18px] rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] transition-colors",
    active
      ? "bg-ink border-ink text-white font-medium"
      : "bg-white border-[#ececee] text-graphite hover:border-dove",
  ].join(" ");
}

interface CampaignsViewProps {
  /** 服务端获取的活动列表（revalidatePath 后自动刷新） */
  campaigns: GrowthCampaign[];
  /** 页面头部 KPI 概览统计（服务端计算） */
  stats: GrowthCampaignStats;
  /** 员工列表（小程序码归属员工选择） */
  employees: GrowthEmployee[];
}

/**
 * 活动配置视图（对齐设计稿 Screen 4）：
 * 页头 + 活动类型 Tab（招募活动 / 估价推广 / 房源推广 / 房源单推广），
 * 招募 Tab 完整迁移现有能力（KPI + 表格 + 小程序码弹窗 + 增删改启停），
 * 其余 Tab 为二期预留空态。增删改通过 Server Actions 调用后端接口，
 * 成功后 revalidatePath 刷新列表数据。
 */
export function CampaignsView({ campaigns, stats, employees }: CampaignsViewProps) {
  const [activeTab, setActiveTab] = React.useState<CampaignTab>("recruit");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingCampaign, setEditingCampaign] = React.useState<GrowthCampaign | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  /** 员工下拉「不绑定员工」哨兵值（Radix Select 空字符串 value 与「未选择」语义重叠，统一用哨兵） */
  const NO_EMPLOYEE = "__none__";

  // 小程序码弹窗状态
  const [qrDialogOpen, setQrDialogOpen] = React.useState(false);
  const [qrCampaign, setQrCampaign] = React.useState<GrowthCampaign | null>(null);
  const [qrEmployeeId, setQrEmployeeId] = React.useState<string>("");
  const [qrGenerating, setQrGenerating] = React.useState(false);
  const [qrResult, setQrResult] = React.useState<{ code: string; image_base64: string } | null>(
    null,
  );

  // KPI 概览（与列表状态联动：停用/启用后「进行中」实时变化）
  const kpiItems: RecruitKpiItem[] = React.useMemo(() => {
    const enabled = campaigns.filter((c) => c.status === "enabled").length;
    return [
      {
        dotClass: "bg-ink",
        label: "进行中活动",
        value: String(enabled),
        trend: { text: `共 ${campaigns.length} 个活动` },
      },
      {
        dotClass: "bg-rust",
        label: "累计分享",
        value: stats.shared.toLocaleString(),
        trend: stats.sharedTrend ?? { text: "近 30 天" },
      },
      {
        dotClass: "bg-apricot-wash",
        label: "累计有效留资",
        value: stats.authed.toLocaleString(),
        trend: { text: `有效占比 ${stats.validPct.toFixed(1)}%` },
      },
      {
        dotClass: "bg-sky-wash",
        label: "整体转化率",
        value: `${stats.conversion.toFixed(1)}%`,
        trend: { text: "有效新客 ÷ 分享次数" },
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
  const handleEdit = async (campaign: GrowthCampaign, data: CampaignFormData) => {
    setSubmitting(true);
    try {
      const result = await updateCampaignAction(campaign.id, data as ActionCampaignFormData);
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
  const handleToggleStatus = async (campaign: GrowthCampaign) => {
    const nextStatus: GrowthCampaign["status"] =
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
  const handleQr = (campaign: GrowthCampaign) => {
    setQrCampaign(campaign);
    setQrEmployeeId("");
    setQrResult(null);
    setQrDialogOpen(true);
  };

  const handleGenerateQr = async () => {
    if (!qrCampaign) return;
    setQrGenerating(true);
    try {
      const result = await generateCampaignQRCodeAction(qrCampaign.id, qrEmployeeId || undefined);
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
  const handleDelete = async (campaign: GrowthCampaign) => {
    return deleteCampaignAction(campaign.id);
  };

  const openCreateDialog = () => {
    setEditingCampaign(null);
    setDialogOpen(true);
  };

  const openEditDialog = (campaign: GrowthCampaign) => {
    setEditingCampaign(campaign);
    setDialogOpen(true);
  };

  const activeTabMeta = CAMPAIGN_TABS.find((tab) => tab.value === activeTab);

  return (
    <>
      <div className="flex flex-col gap-6">
        {/* 页头：标题 + 描述 + 新建按钮（仅招募 Tab 下可用） */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div>
            <h1 className="text-[26px] font-medium tracking-[-0.23px] text-ink">活动配置</h1>
            <p className="mt-1.5 text-[15px] text-graphite">分享素材与小程序码的统一管理</p>
          </div>
          {activeTab === "recruit" && (
            <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
              <Button
                className="h-9 px-5 rounded-full bg-ink text-white text-[15px] font-medium hover:bg-black shrink-0 self-start sm:self-auto"
                onClick={openCreateDialog}
              >
                <Plus className="h-4 w-4" />
                新建活动
              </Button>
            </HasPermission>
          )}
        </div>

        {/* 活动类型 Tab（客户端切换，不涉及 URL） */}
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="活动类型">
          {CAMPAIGN_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.value}
              className={tabClass(activeTab === tab.value)}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
              {tab.phase2 && <PhaseTag2 />}
            </button>
          ))}
        </div>

        {activeTab === "recruit" ? (
          <>
            {/* KPI 概览 */}
            <RecruitKpiGrid items={kpiItems} />

            {/* 活动列表卡 */}
            <div className="bg-white rounded-cards shadow-steep overflow-hidden">
              <div className="px-6 py-5 border-b border-fog">
                <div className="text-[15px] font-medium text-ink">活动列表</div>
                <div className="mt-0.5 text-[13px] text-graphite">
                  共 {campaigns.length} 个活动 · 招募业务线
                </div>
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
          </>
        ) : (
          /* 二期预留空态（对齐设计稿 Screen 4 空态卡） */
          <div className="max-w-[580px] mx-auto my-11 w-full text-center px-10 py-12 border border-dashed border-[#d9dce2] rounded-3xl bg-white">
            <div className="h-[72px] w-[72px] rounded-full bg-fog flex items-center justify-center mx-auto mb-[18px] text-graphite">
              <Rocket className="h-[30px] w-[30px]" />
            </div>
            <h3 className="text-[16px] font-medium text-ink">
              {activeTabMeta?.label} · 二期规划中
            </h3>
            <p className="text-[13px] text-graphite mt-1.5">
              该活动类型将在二期上线，届时可在此配置分享素材与小程序码
            </p>
            <ul className="mt-5 inline-flex flex-col gap-2.5 text-left text-[13px] text-ash">
              <li className="flex gap-2 items-start">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c9ccd4] shrink-0 mt-[7px]" />
                需小程序分享路径携带 campaign_id 参数
              </li>
              <li className="flex gap-2 items-start">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c9ccd4] shrink-0 mt-[7px]" />
                需后端短码映射扩展到对应业务线（valuation / projects / property-sheet）
              </li>
              <li className="flex gap-2 items-start">
                <span className="h-1.5 w-1.5 rounded-full bg-[#c9ccd4] shrink-0 mt-[7px]" />
                上线后可与招募活动共用素材配置与漏斗看板
              </li>
            </ul>
            <div className="mt-5 text-xs text-slate">了解更多：见获客中心迭代方案</div>
          </div>
        )}

        {/* 口径脚注（对齐设计稿 Screen 4 footer） */}
        <footer className="text-[12px] text-slate leading-[1.9] pt-1">
          ① 小程序码短码全局唯一，活动停用后二维码立即失效；②
          已有关联线索的活动不可删除，请改用停用操作；③ 估价 / 房源 / 房源单推广为二期规划，详见各
          Tab 空态说明
        </footer>
      </div>

      {dialogOpen && (
        <CampaignFormDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          campaign={editingCampaign}
          submitting={submitting}
          onSubmit={editingCampaign ? (data) => handleEdit(editingCampaign, data) : handleCreate}
        />
      )}

      {/* 小程序码弹窗 */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-100 rounded-cards p-0 gap-0 bg-white"
        >
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
                  <label className="text-[14px] font-medium text-ink">归属员工（可选）</label>
                  <Select
                    value={qrEmployeeId === "" ? NO_EMPLOYEE : qrEmployeeId}
                    onValueChange={(val) => setQrEmployeeId(val === NO_EMPLOYEE ? "" : val)}
                  >
                    <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px]">
                      <SelectValue placeholder="不绑定员工" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_EMPLOYEE}>不绑定员工</SelectItem>
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
                <p className="text-[12.5px] text-slate text-center">短码: {qrResult.code}</p>
                <button
                  type="button"
                  onClick={handleDownloadQr}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-5 rounded-full bg-ink text-white text-[14px] font-medium hover:bg-black transition-colors"
                >
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
