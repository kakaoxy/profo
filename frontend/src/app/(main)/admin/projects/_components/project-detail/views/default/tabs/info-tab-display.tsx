"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Project } from "../../../../../types";
import { getOwnerBankCardAction } from "@/app/(main)/admin/projects/actions/core";

/**
 * 项目信息卡展示子组件（V4.2 从 info-tab.tsx 拆出，保持 <500 行规范）：
 * 分组标题 / 信息单元 / 迷你文本链接 / 银行卡按需解密 / 敏感字段显隐 + 格式化工具。
 * 仅被 InfoTab 使用，不对外导出。
 */

const BUSINESS_FORM_LABEL: Record<string, string> = {
  agent: "代理美化",
  wholesale: "收购美化",
};

/** 脱敏函数：前3后4，中间用*代替 */
function maskString(str?: string | null, keepStart = 3, keepEnd = 4): string | undefined {
  if (!str) return undefined;
  if (str.length <= keepStart + keepEnd) return "*".repeat(str.length);
  return `${str.slice(0, keepStart)}${"*".repeat(str.length - keepStart - keepEnd)}${str.slice(-keepEnd)}`;
}

/** 格式化户型显示 */
function formatLayout(layout?: string | null): string | undefined {
  if (!layout) return undefined;
  const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
  if (match) {
    return `${match[1]}室${match[2]}厅${match[3]}卫`;
  }
  return layout;
}

/** 格式化税费承担方显示 */
function formatCostAssumption(project: Project): string | undefined {
  const type = project.cost_assumption_type;
  const map: Record<string, string> = {
    meifangbao: "美房宝承担",
    owner: "业主承担",
    respective: "各自承担",
    other: "其他",
  };
  if (!type) return undefined;
  if (type === "other") {
    return project.cost_assumption_other ? `其他：${project.cost_assumption_other}` : "其他";
  }
  return map[type] ?? type;
}

/** 委托期限范围展示 */
function formatCommissionRange(project: Project): string | undefined {
  const start = project.commission_start_date;
  const end = project.commission_end_date;
  if (!start && !end) return undefined;
  return [start, end].filter(Boolean).join(" ~ ");
}

/** 分组标题（原型 .group-title）：13px uppercase + 右侧 flex 分隔线，可带后缀 pill */
function GroupTitle({
  children,
  suffix,
  className,
}: {
  children: ReactNode;
  suffix?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-1 flex items-center gap-2", className)}>
      <h4 className="shrink-0 text-[13px] font-medium uppercase tracking-[0.05em] text-graphite">
        {children}
      </h4>
      {suffix}
      <span className="h-px flex-1 bg-[#f0f0f2]" aria-hidden />
    </div>
  );
}

/** 信息单元（原型 .info-item）：label 上 value 下，下边框分隔；full 跨两列 */
function InfoCell({
  label,
  value,
  full,
  muted,
  copyable,
  copyValue,
}: {
  label: string;
  value?: ReactNode;
  full?: boolean;
  muted?: boolean;
  copyable?: boolean;
  copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    const textToCopy = copyValue ?? (typeof value === "string" ? value : "");
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  }, [copyValue, value]);

  if (value === undefined || value === null || value === "") return null;

  return (
    <div
      className={cn(
        "flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]",
        full && "col-span-1 sm:col-span-2",
      )}
    >
      <span className="text-[13px] font-[430] text-graphite">{label}</span>
      <span
        className={cn(
          "flex flex-wrap items-center gap-2 text-[14.5px] font-[450] text-ink",
          muted && "font-normal text-dove",
        )}
      >
        {value}
        {copyable && (
          <MiniLink
            onClick={handleCopy}
            icon={
              copied ? (
                <Check className="h-[13px] w-[13px]" />
              ) : (
                <Copy className="h-[13px] w-[13px]" />
              )
            }
          >
            {copied ? "已复制" : "复制"}
          </MiniLink>
        )}
      </span>
    </div>
  );
}

/** 迷你文本链接（原型 .mini-link）：13px graphite，hover ink */
function MiniLink({
  onClick,
  icon,
  children,
  disabled,
}: {
  onClick?: () => void;
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex cursor-pointer items-center gap-1 bg-none text-[13px] font-[430] text-graphite transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * 银行卡号展示项（原型 .info-item）：默认脱敏 muted，点击「显示」按需解密，支持复制完整卡号。
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
    <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
      <span className="text-[13px] font-[430] text-graphite">收款银行卡</span>
      <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-[450] text-ink">
        <span className={cn("font-mono", !revealed && "font-normal text-dove")}>
          {revealed && fullValue !== null ? fullValue : maskedValue}
        </span>
        <MiniLink
          onClick={handleReveal}
          disabled={loading || !ownerId}
          icon={
            loading ? (
              <Loader2 className="h-[13px] w-[13px] animate-spin" />
            ) : revealed ? (
              <EyeOff className="h-[13px] w-[13px]" />
            ) : (
              <Eye className="h-[13px] w-[13px]" />
            )
          }
        >
          {loading ? "加载中" : revealed ? "隐藏" : "显示"}
        </MiniLink>
        <MiniLink
          onClick={handleCopy}
          disabled={loading || !ownerId}
          icon={
            copied ? (
              <Check className="h-[13px] w-[13px]" />
            ) : (
              <Copy className="h-[13px] w-[13px]" />
            )
          }
        >
          {copied ? "已复制" : "复制"}
        </MiniLink>
      </span>
    </div>
  );
}

/**
 * 敏感字段展示项（原型 .info-item）：默认脱敏，点击「显示」切换显隐，支持复制完整值。
 * 复用响应内明文（电话/身份证），与银行卡按需解密接口不同。
 */
function RevealableField({
  label,
  value,
  keepStart = 3,
  keepEnd = 4,
}: {
  label: string;
  value?: string | null;
  keepStart?: number;
  keepEnd?: number;
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
    <div className="flex flex-col gap-[3px] border-b border-[#f0f0f2] py-[13px]">
      <span className="text-[13px] font-[430] text-graphite">{label}</span>
      <span className="flex flex-wrap items-center gap-2 text-[14.5px] font-[450] text-ink">
        <span className="font-mono">{display}</span>
        <MiniLink
          onClick={() => setRevealed((r) => !r)}
          icon={
            revealed ? (
              <EyeOff className="h-[13px] w-[13px]" />
            ) : (
              <Eye className="h-[13px] w-[13px]" />
            )
          }
        >
          {revealed ? "隐藏" : "显示"}
        </MiniLink>
        <MiniLink
          onClick={handleCopy}
          icon={
            copied ? (
              <Check className="h-[13px] w-[13px]" />
            ) : (
              <Copy className="h-[13px] w-[13px]" />
            )
          }
        >
          {copied ? "已复制" : "复制"}
        </MiniLink>
      </span>
    </div>
  );
}

export {
  BUSINESS_FORM_LABEL,
  formatLayout,
  formatCostAssumption,
  formatCommissionRange,
  GroupTitle,
  InfoCell,
  MiniLink,
  BankCardItem,
  RevealableField,
};
