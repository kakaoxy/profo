"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText,
  TrendingUp,
  User,
  MapPin,
  FileCheck,
  Zap,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Project } from "../../../../../types";
import { InfoCard as InfoSection, InfoItem } from "@/components/common";
import { formatDate, formatPrice } from "../../../utils";
import { searchCommunitiesAction } from "@/app/(main)/admin/leads/actions/search-communities";
import { getOwnerBankCardAction } from "@/app/(main)/admin/projects/actions/core";

interface InfoTabProps {
  project: Project;
}

const BUSINESS_FORM_LABEL: Record<string, string> = {
  agent: "代理美化",
  wholesale: "收购美化",
};

/** 脱敏函数：前3后4，中间用*代替 */
function maskString(str?: string | null, keepStart = 3, keepEnd = 4): string | undefined {
  if (!str) return undefined;
  if (str.length <= keepStart + keepEnd) return str;
  const start = str.slice(0, keepStart);
  const end = str.slice(-keepEnd);
  const middle = "*".repeat(str.length - keepStart - keepEnd);
  return `${start}${middle}${end}`;
}

/** 格式化户型显示 */
function formatLayout(layout?: string | null): string | undefined {
  if (!layout) return undefined;
  // 将 "3室2厅2卫" 格式化为更友好的显示
  const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
  if (match) {
    return `${match[1]}室${match[2]}厅${match[3]}卫`;
  }
  return layout;
}

/** 格式化税费承担方显示 */
function formatCostAssumption(project: Project): string | undefined {
  const typeMap: Record<string, string> = {
    meifangbao: "美房宝承担",
    owner: "业主承担",
    respective: "各自承担",
    other: "其他",
  };
  if (!project.cost_assumption_type) return undefined;
  const typeLabel = typeMap[project.cost_assumption_type] || project.cost_assumption_type;
  if (project.cost_assumption_type === "other" && project.cost_assumption_other) {
    return `${typeLabel} (${project.cost_assumption_other})`;
  }
  return typeLabel;
}

/** 委托期限范围展示 */
function formatCommissionRange(project: Project): string | undefined {
  const start = project.commission_start_date;
  const end = project.commission_end_date;
  if (!start && !end) return undefined;
  if (start && end) return `${start} 至 ${end}`;
  return start || end || undefined;
}

/**
 * 银行卡号展示项 - 默认脱敏，点击眼睛切换显隐，支持复制完整卡号.
 * 完整卡号通过按需接口获取，不随项目详情下发。
 */
function BankCardItem({ maskedValue, ownerId }: { maskedValue?: string | null; ownerId?: string }) {
  const [revealed, setRevealed] = useState(false);
  const [fullValue, setFullValue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchFull = useCallback(async (): Promise<string | null> => {
    if (fullValue !== null) return fullValue;
    if (!ownerId) return null;
    setLoading(true);
    try {
      const result = await getOwnerBankCardAction(ownerId);
      if (result.success && result.data) {
        setFullValue(result.data);
        return result.data;
      }
      toast.error(result.message || "获取卡号失败");
      return null;
    } catch {
      toast.error("网络错误");
      return null;
    } finally {
      setLoading(false);
    }
  }, [fullValue, ownerId]);

  const handleReveal = async () => {
    if (revealed) {
      setRevealed(false);
      return;
    }
    const val = await fetchFull();
    if (val) setRevealed(true);
  };

  const handleCopy = async () => {
    const val = fullValue ?? (await fetchFull());
    if (!val) return;
    try {
      await navigator.clipboard.writeText(val);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  if (!maskedValue) return null;

  return (
    <div className="flex items-center justify-between gap-2 py-0.5 min-h-[24px]">
      <span className="text-xs text-muted-foreground font-medium shrink-0 mr-4">银行卡号</span>
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-foreground font-mono">
          {revealed && fullValue !== null ? fullValue : maskedValue}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:text-foreground p-0 shrink-0"
          onClick={handleReveal}
          disabled={loading || !ownerId}
          title={revealed ? "隐藏" : "显示完整卡号"}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : revealed ? (
            <EyeOff className="h-3 w-3" />
          ) : (
            <Eye className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:text-foreground p-0 shrink-0"
          onClick={handleCopy}
          disabled={loading || !ownerId}
          title="复制完整卡号"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * 敏感字段展示项 - 默认脱敏，点击眼睛切换显隐，支持复制完整值.
 * 复用响应内明文（电话/身份证），与银行卡按需解密接口不同。
 */
function RevealableField({
  label,
  value,
  keepStart = 3,
  keepEnd = 4,
  className,
}: {
  label: string;
  value?: string | null;
  keepStart?: number;
  keepEnd?: number;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!value) return null;

  const masked = maskString(value, keepStart, keepEnd) ?? value;
  const display = revealed ? value : masked;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className={cn("flex items-center justify-between gap-2 py-0.5 min-h-[24px]", className)}>
      <span className="text-xs text-muted-foreground font-medium shrink-0 mr-4">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-sm font-medium text-foreground font-mono">{display}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:text-foreground p-0 shrink-0"
          onClick={() => setRevealed((r) => !r)}
          title={revealed ? "隐藏" : "显示完整信息"}
        >
          {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 text-muted-foreground hover:text-foreground p-0 shrink-0"
          onClick={handleCopy}
          title="复制完整信息"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
      </div>
    </div>
  );
}

/**
 * 信息 Tab - 展示项目详细信息
 * 按照创建表单的结构组织：基础信息、代理协议、业主信息
 */
export function InfoTab({ project }: InfoTabProps) {
  // 行政区来自小区（Project 本身没有 district 字段），通过小区搜索接口异步拉取
  // 使用 {name, district} 结构避免小区切换时显示陈旧数据
  const [fetched, setFetched] = useState<{
    name: string;
    district?: string;
  } | null>(null);

  useEffect(() => {
    // 已有 district 或无小区名时不查询
    if (project.district || !project.community_name) {
      return;
    }
    const name = project.community_name;
    let mounted = true;
    searchCommunitiesAction(name)
      .then((results) => {
        if (!mounted) return;
        const matched = results.find((c) => c.name === name);
        setFetched({ name, district: matched?.district });
      })
      .catch(() => {
        if (mounted) setFetched({ name, district: undefined });
      });
    return () => {
      mounted = false;
    };
  }, [project.community_name, project.district]);

  const district =
    project.district ||
    (fetched && fetched.name === project.community_name ? fetched.district : undefined);

  // 已售项目展示用时天数
  const isSold = project.status === "sold" || project.status === "已售";
  const daysOnMarket =
    isSold && project.days_on_market != null ? `${project.days_on_market} 天` : undefined;

  return (
    <div className="space-y-4">
      {/* --- 基础信息 --- */}
      <InfoSection title="基础信息" icon={<MapPin className="h-4 w-4" />}>
        {/* 小区名称 */}
        <InfoItem label="小区名称" value={project.community_name} />

        {/* 行政区 */}
        <InfoItem label="行政区" value={district} />

        {/* 业务形式 */}
        <InfoItem
          label="业务形式"
          value={project.business_form ? BUSINESS_FORM_LABEL[project.business_form] : "未设置"}
        />

        {/* 产证面积 */}
        <InfoItem label="产证面积" value={project.area ? `${project.area} ㎡` : undefined} />

        {/* 户型 */}
        <InfoItem label="户型" value={formatLayout(project.layout)} />

        {/* 朝向 */}
        <InfoItem label="朝向" value={project.orientation} />

        {/* 详细地址 */}
        <InfoItem
          label="详细地址"
          value={project.address}
          className="sm:col-span-2"
          copyable
          copyValue={project.address}
        />
      </InfoSection>

      {/* --- 代理协议 --- */}
      <InfoSection title="代理协议" icon={<FileCheck className="h-4 w-4" />}>
        {/* 合同编号 */}
        <InfoItem
          label="合同编号"
          value={project.contract_no}
          copyable
          copyValue={project.contract_no}
        />

        {/* 签约日期 */}
        <InfoItem label="签约日期" value={formatDate(project.signing_date)} />

        {/* 交房日期 */}
        <InfoItem label="交房日期" value={formatDate(project.planned_handover_date)} />

        {/* 签约价格 */}
        <InfoItem label="签约价格" value={formatPrice(project.signing_price)} highlight />

        {/* 合同周期 */}
        <InfoItem
          label="合同周期"
          value={project.signing_period ? `${project.signing_period} 天` : undefined}
        />

        {/* 顺延期 */}
        <InfoItem
          label="顺延期"
          value={project.extension_period ? `${project.extension_period} 天` : undefined}
        />

        {/* 顺延期租金 */}
        <InfoItem
          label="顺延期租金"
          value={project.extension_rent ? `¥ ${project.extension_rent} / 月` : undefined}
        />

        {/* 委托期限 */}
        <InfoItem
          label="委托期限"
          value={formatCommissionRange(project)}
          className="sm:col-span-2"
        />

        {/* 税费及佣金承担方 */}
        <InfoItem
          label="税费及佣金承担方"
          value={formatCostAssumption(project)}
          className="sm:col-span-2"
        />

        {/* 其他约定条款 */}
        <InfoItem label="其他约定条款" value={project.other_agreements} className="sm:col-span-2" />
      </InfoSection>

      {/* --- 业主信息 --- */}
      <InfoSection title="业主信息" icon={<User className="h-4 w-4" />}>
        {project.owners && project.owners.length > 0 ? (
          // 多业主遍历（owners 数组优先）
          project.owners.map((owner, index) => (
            <div
              key={owner.id ?? `owner-${index}`}
              className={cn(index > 0 && "mt-4 pt-4 border-t border-border")}
            >
              {/* 关系类型：仅非"业主"时显示 */}
              {owner.relation_type && owner.relation_type !== "业主" && (
                <InfoItem label="关系类型" value={owner.relation_type} />
              )}

              <InfoItem label="业主姓名" value={owner.owner_name} />

              {/* 联系电话 - 默认脱敏，点击眼睛切换显隐，支持复制 */}
              <RevealableField label="联系电话" value={owner.owner_phone} />

              {/* 身份证号 - 默认脱敏，点击眼睛切换显隐，支持复制 */}
              <RevealableField label="身份证号" value={owner.owner_id_card} />

              {/* 开户行 - 仅有值时显示 */}
              <InfoItem label="开户行" value={owner.bank_name} />

              {/* 银行卡号 - 默认脱敏，点击眼睛显示完整，支持复制 */}
              <BankCardItem maskedValue={owner.bank_card_number} ownerId={owner.id} />

              {/* 备注 - 仅有值时显示 */}
              <InfoItem label="备注" value={owner.owner_info} />
            </div>
          ))
        ) : (
          // 回退到单业主字段（兼容历史数据）
          <>
            <InfoItem label="业主姓名" value={project.owner_name} />

            {/* 业主联系方式 - 默认脱敏，点击眼睛切换显隐，支持复制 */}
            <RevealableField label="业主联系方式" value={project.owner_phone} />

            {/* 业主身份证 - 默认脱敏，点击眼睛切换显隐，支持复制 */}
            <RevealableField
              label="业主身份证"
              value={project.owner_id_card}
              className="sm:col-span-2"
            />
          </>
        )}
      </InfoSection>

      {/* --- 公用事业户号 --- */}
      {/* 仅有值时（任一户号非空）才渲染整个分组 */}
      {(project.electricity_account || project.water_account || project.gas_account) && (
        <InfoSection title="公用事业户号" icon={<Zap className="h-4 w-4" />}>
          <InfoItem label="电表户号" value={project.electricity_account} />
          <InfoItem label="水表户号" value={project.water_account} />
          <InfoItem label="煤气户号" value={project.gas_account} />
        </InfoSection>
      )}

      {/* --- 交易数据（保留作为参考） --- */}
      <InfoSection title="交易数据" icon={<TrendingUp className="h-4 w-4" />}>
        <InfoItem label="挂牌价" value={formatPrice(project.list_price)} highlight />
        <InfoItem
          label="成交价"
          value={
            project.sold_price ? (
              <span className="text-money-positive font-bold font-mono">
                {formatPrice(project.sold_price)}
              </span>
            ) : undefined
          }
        />
        <InfoItem
          label="现金流"
          value={
            project.net_cash_flow !== undefined ? (
              <span
                className={cn(
                  "font-bold font-mono",
                  (project.net_cash_flow ?? 0) >= 0 ? "text-money-positive" : "text-money-negative",
                )}
              >
                {formatPrice((project.net_cash_flow || 0) / 10000)}
              </span>
            ) : undefined
          }
        />
        <InfoItem label="成交日期" value={formatDate(project.sold_date)} />
        <InfoItem label="上架日期" value={formatDate(project.listing_date)} />
        {/* 用时（仅已售项目且有值时显示） */}
        {daysOnMarket && <InfoItem label="用时" value={daysOnMarket} highlight />}
      </InfoSection>

      {/* --- 备注 --- 仅有值时显示 */}
      {project.notes && (
        <InfoSection title="备注" icon={<FileText className="h-4 w-4" />}>
          <InfoItem label="备注" value={project.notes} className="sm:col-span-2" />
        </InfoSection>
      )}
    </div>
  );
}
