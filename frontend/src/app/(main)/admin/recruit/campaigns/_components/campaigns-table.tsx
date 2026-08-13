"use client";

import Image from "next/image";
import { ImageIcon, Loader2 } from "lucide-react";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { safeFormatDate } from "@/lib/formatters";
import { RECRUIT_BADGE_CLASS } from "../../types";
import type { RecruitCampaign } from "../../types";

interface CampaignsTableProps {
  campaigns: RecruitCampaign[];
  onEdit: (campaign: RecruitCampaign) => void;
  onToggleStatus: (campaign: RecruitCampaign) => void;
  onQr: (campaign: RecruitCampaign) => void;
  /** 正在切换状态的行 ID（null 表示无操作进行中） */
  togglingId: string | null;
}

/** 是否为本地预览图（blob URL / 本地开发地址），绕过 Next.js 图片优化（同 leads 图片处理约定） */
function isLocalPreviewUrl(url: string | null): boolean {
  if (!url) return true;
  return (
    url.startsWith("blob:") ||
    url.includes("127.0.0.1") ||
    url.includes("localhost")
  );
}

/**
 * 活动配置表格（第一期）：对齐设计稿列结构
 * `# / 活动名称 / 分享标题 / 分享配图（5:4）/ 状态 / 创建时间 / 操作`。
 * 行操作：编辑 / 小程序码 / 停用（停用中显示「启用」），写操作按权限隐藏。
 */
export function CampaignsTable({
  campaigns,
  onEdit,
  onToggleStatus,
  onQr,
  togglingId,
}: CampaignsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-[13px] font-medium text-graphite whitespace-nowrap">
            <th className="px-5 py-3 border-b border-fog w-10">#</th>
            <th className="px-5 py-3 border-b border-fog">活动名称</th>
            <th className="px-5 py-3 border-b border-fog">分享标题</th>
            <th className="px-5 py-3 border-b border-fog">分享配图（5:4）</th>
            <th className="px-5 py-3 border-b border-fog">状态</th>
            <th className="px-5 py-3 border-b border-fog">创建时间</th>
            <th className="px-5 py-3 border-b border-fog text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign, index) => {
            const hasImage =
              campaign.image_url && campaign.image_url.trim() !== "";
            const enabled = campaign.status === "enabled";
            return (
              <tr
                key={campaign.id}
                className="hover:bg-fog transition-colors"
              >
                <td className="px-5 py-3.5 border-b border-fog align-middle text-[12.5px] text-graphite">
                  {index + 1}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="font-medium text-ink whitespace-nowrap">
                    {campaign.name || "-"}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-graphite">
                    ID: {campaign.id}
                  </div>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="font-medium text-ink">{campaign.title || "-"}</div>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  {hasImage ? (
                    <div className="relative w-15 h-12 rounded-images overflow-hidden border border-fog">
                      <Image
                        src={campaign.image_url as string}
                        alt={campaign.name || "分享配图"}
                        fill
                        className="object-cover"
                        sizes="60px"
                        unoptimized={isLocalPreviewUrl(campaign.image_url)}
                      />
                    </div>
                  ) : (
                    <div className="relative w-15 h-12 flex items-center justify-center rounded-images bg-fog border border-fog">
                      <ImageIcon className="h-4 w-4 text-dove" />
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <span
                    className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap ${
                      enabled
                        ? RECRUIT_BADGE_CLASS.ink
                        : RECRUIT_BADGE_CLASS.outline
                    }`}
                  >
                    {enabled ? "启用中" : "已停用"}
                  </span>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle text-[12.5px] text-graphite whitespace-nowrap">
                  {safeFormatDate(campaign.created_at, "yyyy-MM-dd HH:mm")}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="flex items-center justify-end gap-3">
                    <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
                      <button
                        type="button"
                        className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
                        onClick={() => onEdit(campaign)}
                      >
                        编辑
                      </button>
                    </HasPermission>
                    <button
                      type="button"
                      className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
                      onClick={() => onQr(campaign)}
                    >
                      小程序码
                    </button>
                    <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
                      <button
                        type="button"
                        disabled={togglingId === campaign.id}
                        className={`text-[14px] font-medium px-0.5 transition-opacity hover:opacity-60 disabled:opacity-50 inline-flex items-center gap-1 ${
                          enabled ? "text-rust" : "text-ink"
                        }`}
                        onClick={() => onToggleStatus(campaign)}
                      >
                        {togglingId === campaign.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        {enabled ? "停用" : "启用"}
                      </button>
                    </HasPermission>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
