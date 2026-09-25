"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Briefcase, ChevronRight, Eye } from "lucide-react";
import { addDays, format } from "date-fns";
import { cn } from "@/lib/utils";

import { client } from "@/lib/api-client";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";

import type { Project } from "../../../types";
import type { ViewMode } from "../../../_components/project-detail/constants";
import type { RenovationContractMeta } from "../../../_components/project-detail/views/renovation";

interface SideColumnProps {
  project: Project;
  /** 当前阶段视图（团队/关键日期/快捷入口/备注按阶段动态渲染） */
  viewMode: ViewMode;
  /**
   * 装修合同摘要（页面级 useTeamMembers 提供：装修公司/对接负责人/实际开工/预计完工）。
   * 由 RenovationView 上报的旧链路已在页面层移除，统一走页面级数据源。
   */
  renovationMeta?: RenovationContractMeta;
  /** userId → 展示名（页面级用户列表；渠道/讲房/谈判/对接负责人角色 ID 解析用） */
  usersById?: Map<string, string>;
}

interface MemberRow {
  name: string;
  role: string;
}

interface DateRow {
  label: string;
  value: string;
  accent?: boolean;
}

/** ISO/短横线日期 → 原型「2026.08.12」展示格式（纯字符串处理，避免 hydration 差异） */
function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replace(/-/g, ".") : null;
}

/** 未设置占位文案（有角色无成员时的统一空态，避免整行隐藏造成"信息缺失"观感） */
const EMPTY_MEMBER_NAME = "未设置";

/**
 * 副列（V4.1，按阶段动态）：钥匙管理 · 团队与成员 · 关键日期 · 快捷入口 · 备注
 *
 * - 钥匙管理：客户端挂载后拉取 /keys/summary 三行概要（不显密文）；加载中与
 *   403 受限视图显示「—」，403 时隐藏「进入钥匙管理」链接，其他错误静默降级
 * - 团队：固定渲染三类五角色行——项目负责人（project_manager）、对接负责人
 *   （装修合同 contact_person_id → 用户昵称）、渠道/讲房/谈判
 *   （channel_manager_id / property_agent_id / negotiator_id → 用户昵称，回退旧文本字段）；
 *   角色 ID 经页面级用户列表（usersById）解析为昵称；未设置显示「未设置」占位。
 *   已下架不渲染团队卡
 * - 关键日期：按阶段取行（Rust 强调行见各分支），删除原「创建/更新时间」行；
 *   已下架不渲染此卡。装修开工/预计完工优先取装修合同（renovationMeta），
 *   开工回退 project.renovation_start_date；缺失行直接跳过
 * - 快捷入口：签约/在售=账本+监控；装修=仅账本「装修支出流水」；已售=仅账本「利润与结算明细」；
 *   已下架=仅账本「历史收支明细」
 * - 备注卡仅签约阶段渲染；已下架副列仅渲染快捷入口卡
 */
export function SideColumn({ project, viewMode, renovationMeta, usersById }: SideColumnProps) {
  const managerName = project.project_manager?.nickname || project.manager;

  // 角色 ID → 用户昵称解析；ID 缺失时回退旧文本字段（兼容历史数据），再无则「未设置」占位
  const userNameOf = (id?: string | null, fallback?: string | null): string => {
    if (id) {
      const name = usersById?.get(id);
      if (name) return name;
    }
    return fallback || EMPTY_MEMBER_NAME;
  };

  // 团队与成员（V4.3 需求：固定展示三类五角色；对接负责人取自装修合同 contact_person_id）
  const members: MemberRow[] = [
    { name: managerName || EMPTY_MEMBER_NAME, role: "项目负责人" },
    {
      name: userNameOf(renovationMeta?.contactPersonId, renovationMeta?.companyName),
      role: "对接负责人",
    },
    { name: userNameOf(project.channel_manager_id, project.channel_manager), role: "渠道经理" },
    { name: userNameOf(project.property_agent_id, project.presenter), role: "讲房人" },
    { name: userNameOf(project.negotiator_id, project.negotiator), role: "谈判人" },
  ];

  const dateRows: DateRow[] = (() => {
    switch (viewMode) {
      case "renovation":
        return [
          { label: "签约日期", value: formatDate(project.signing_date) },
          {
            label: "装修开工",
            value: formatDate(renovationMeta?.actualStart ?? project.renovation_start_date),
          },
          // 预计完工（合同约定竣工）：装修合同子资源，缺失跳过
          { label: "预计完工", value: formatDate(renovationMeta?.expectedEnd), accent: true },
        ];
      case "selling": {
        // 与基础信息卡委托倒计时同源：交房日 + 签约周期 + 顺延期；无法计算时回退 commission_end_date
        const commissionDeadline = (() => {
          if (!project.planned_handover_date) return project.commission_end_date ?? null;
          const totalDays = (project.signing_period || 0) + (project.extension_period || 0);
          try {
            return format(
              addDays(new Date(project.planned_handover_date), totalDays),
              "yyyy-MM-dd",
            );
          } catch {
            return project.commission_end_date ?? null;
          }
        })();
        // 设计稿 1549-1552：签约日期 / 装修完工 / 上架日期 / 委托截止（Rust 强调）
        return [
          { label: "签约日期", value: formatDate(project.signing_date) },
          { label: "装修完工", value: formatDate(renovationMeta?.actualEnd) },
          { label: "上架日期", value: formatDate(project.listing_date) },
          { label: "委托截止", value: formatDate(commissionDeadline), accent: true },
        ];
      }
      case "sold":
        return [
          { label: "签约", value: formatDate(project.signing_date) },
          { label: "交房", value: formatDate(project.planned_handover_date) },
          { label: "上架", value: formatDate(project.listing_date) },
          {
            label: "成交",
            value: formatDate(project.sold_at || project.sold_date),
            accent: true,
          },
        ];
      case "ended":
        return [];
      default:
        return [
          { label: "签约日期", value: formatDate(project.signing_date) },
          { label: "计划交房", value: formatDate(project.planned_handover_date), accent: true },
          { label: "委托起始", value: formatDate(project.commission_start_date) },
          { label: "委托截止", value: formatDate(project.commission_end_date) },
        ];
    }
  })().filter((row): row is DateRow => row.value !== null);

  const noteText = project.notes?.trim() || project.remarks?.trim() || null;

  const monitorHref = `?monitor_id=${project.id}&project_name=${encodeURIComponent(project.name)}`;
  const ledgerHref = `/admin/ledger/${project.id}`;

  // 账本副标题按阶段：装修=装修支出流水 · 已售=利润与结算明细 · 已下架=历史收支明细 · 其余=默认
  const ledgerDescription = (() => {
    switch (viewMode) {
      case "renovation":
        return "装修支出流水";
      case "sold":
        return "利润与结算明细";
      case "ended":
        return "历史收支明细";
      default:
        return "收支流水与利润核算";
    }
  })();
  const showMonitor = viewMode === "signing" || viewMode === "selling";

  return (
    <>
      <KeyManagementCard projectId={project.id} />

      {viewMode !== "ended" && (
        <SideCard title="团队与成员">
          {members.map((member, index) => (
            <PersonRow
              key={`${member.role}-${member.name}`}
              member={member}
              washIndex={index % 3}
            />
          ))}
        </SideCard>
      )}

      {viewMode !== "ended" && (
        <SideCard title="关键日期">
          {dateRows.length > 0 ? (
            dateRows.map((row) => <DateRowItem key={row.label} row={row} />)
          ) : (
            <p className="py-1 text-sm font-[430] text-graphite">暂无关键日期数据</p>
          )}
        </SideCard>
      )}

      <SideCard title="快捷入口">
        <div className="space-y-2.5">
          <ShortcutLink
            href={ledgerHref}
            icon={Briefcase}
            iconClassName="bg-apricot-wash text-rust"
            title="项目账本"
            description={ledgerDescription}
          />
          {showMonitor && (
            <ShortcutLink
              href={monitorHref}
              icon={Eye}
              iconClassName="bg-sky-wash text-[#2c4d7f]"
              title="房源监控"
              description="渠道曝光与访客数据"
            />
          )}
        </div>
      </SideCard>

      {viewMode === "signing" && (
        <SideCard title="备注">
          {noteText ? (
            <p className="whitespace-pre-wrap text-sm font-[430] leading-[1.65] text-ash">
              {noteText}
            </p>
          ) : (
            <p className="text-sm font-[430] text-graphite">暂无备注，可在编辑项目时补充。</p>
          )}
        </SideCard>
      )}
    </>
  );
}

/** 副列白卡容器：24px 圆角 + 三层签名阴影（与主列卡片同一 token） */
function SideCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-cards bg-pure-white p-6 font-sohne shadow-steep">
      {/* 卡头：16px 无图标（设计稿 .card-title，对齐 1541/1548/1555） */}
      <h3 className="text-base font-[500] text-ink">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

type KeySummaryResponse = components["schemas"]["KeySummaryResponse"];

/**
 * 钥匙管理卡（V4.5）：三行概要（不显密文），组件挂载后经 client 拉取 summary，
 * 不改动 SideColumn 编排器数据流（props 仍全量来自页面级）。
 * 加载中显示「—」；403（无钥匙查看权限）为受限视图——数据保持「—」且隐藏进入链接；
 * 其他错误静默降级（console.error），卡片仍渲染。
 */
function KeyManagementCard({ projectId }: { projectId: string }) {
  const [summary, setSummary] = useState<KeySummaryResponse | null>(null);
  const [restricted, setRestricted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .GET("/api/v1/projects/{project_id}/keys/summary", {
        params: { path: { project_id: projectId } },
      })
      .then(({ data, error, response }) => {
        if (cancelled) return;
        if (error || !data) {
          if (response.status === 403) {
            setRestricted(true);
          } else {
            console.error("获取钥匙概要失败:", error);
          }
          return;
        }
        setSummary(extractApiData<KeySummaryResponse>(data));
      })
      .catch((err) => {
        if (!cancelled) console.error("获取钥匙概要异常:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const placeholder = "—";
  const managerValue = summary
    ? summary.manager_key.set
      ? `已设置 · ${formatDate(summary.manager_key.updated_at) ?? placeholder}`
      : "未设置"
    : placeholder;
  const normalValue = summary
    ? `有效 ${summary.normal_active_count} · 待录入 ${summary.normal_pending_count}${
        summary.normal_disabled_count > 0 ? ` · 已停用 ${summary.normal_disabled_count}` : ""
      }`
    : placeholder;
  const shareValue = summary
    ? `${summary.active_share_count} 个分享 · 累计查看 ${summary.total_view_count} 次`
    : placeholder;

  return (
    <SideCard title="钥匙管理">
      <KeySummaryRow label="管理密码" value={managerValue} />
      <KeySummaryRow
        label="普通密码"
        value={normalValue}
        sub={
          summary?.normal_updated_by_name ? `最近录入人 ${summary.normal_updated_by_name}` : null
        }
      />
      <KeySummaryRow label="分享中" value={shareValue} />
      {!restricted && (
        <Link
          href={`/admin/projects/${projectId}/keys`}
          className="mt-3 inline-flex items-center gap-1 text-sm font-[450] text-ink no-underline transition-colors hover:text-rust"
        >
          进入钥匙管理
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </SideCard>
  );
}

/** 钥匙概要行：label + 主值 + 可选副值（最近录入人），结构对齐原型 .side-row */
function KeySummaryRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string | null;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-[#f0f0f2] py-[11px] text-sm last:border-b-0">
      <span className="w-[76px] shrink-0 text-[13px] font-[430] text-graphite">{label}</span>
      <span className="min-w-0 font-[450] text-ink">
        {value}
        {sub && <small className="block text-xs font-[430] text-graphite">{sub}</small>}
      </span>
    </div>
  );
}

/** 头像三色轮换（原型 .avatar peach→skyb→mint，字色统一 ink） */
const AVATAR_BG_BY_INDEX = ["bg-apricot-wash", "bg-sky-wash", "bg-[#ddeddd]"] as const;

/** 成员行：首字圆徽（三色轮换）+ 姓名/角色，结构对应原型 .person；「未设置」灰底「?」占位 */
function PersonRow({ member, washIndex }: { member: MemberRow; washIndex: number }) {
  const isEmpty = member.name === EMPTY_MEMBER_NAME;
  const initial = isEmpty ? "?" : member.name.trim().charAt(0);
  return (
    <div className="flex items-center gap-3 border-b border-[#f0f0f2] py-[11px] last:border-b-0">
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-medium text-ink",
          isEmpty
            ? "bg-[#f0f0f2] text-dove"
            : (AVATAR_BG_BY_INDEX[washIndex] ?? AVATAR_BG_BY_INDEX[0]),
        )}
      >
        {initial}
      </span>
      <div className="min-w-0">
        <p
          className={cn(
            "truncate text-[14.5px] font-[480]",
            isEmpty ? "text-graphite" : "text-ink",
          )}
        >
          {member.name}
        </p>
        <p className="text-[13px] font-[430] text-graphite">{member.role}</p>
      </div>
    </div>
  );
}

/** 关键日期行：label 76px + 值，结构对应原型 .side-row */
function DateRowItem({ row }: { row: DateRow }) {
  return (
    <div className="flex items-center gap-3 border-b border-[#f0f0f2] py-[11px] text-sm last:border-b-0">
      <span className="w-[76px] shrink-0 text-[13px] font-[430] text-graphite">{row.label}</span>
      <span className={cn("font-[450] text-ink", row.accent && "text-rust")}>{row.value}</span>
    </div>
  );
}

/** 快捷入口行卡：图标徽 + 标题/描述 + 箭头，结构对应原型 .shortcut */
function ShortcutLink({
  href,
  icon: Icon,
  iconClassName,
  title,
  description,
  scroll,
}: {
  href: string;
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  description: string;
  scroll?: boolean;
}) {
  return (
    <Link
      href={href}
      scroll={scroll}
      className="flex items-center gap-3 rounded-[16px] border border-[#efeff1] bg-pure-white px-[15px] py-[13px] text-sm font-[450] text-ink no-underline transition-all hover:-translate-y-px hover:border-dove hover:shadow-steep-sm"
    >
      <span
        className={cn(
          "grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[11px]",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        {title}
        <small className="block text-xs font-[430] text-graphite">{description}</small>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-dove" />
    </Link>
  );
}
