"use client";

import Link from "next/link";
import {
  Building2,
  ChevronRight,
  FileText,
  ListChecks,
  Megaphone,
  Phone,
  Plus,
  Upload,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { WidgetHead } from "./widgets/widget-head";

/** 单个入口定义（设计稿 QUICK，hifi:1013；文案已按 SPEC D-06/D-08/D-09 降级） */
interface QuickEntry {
  label: string;
  /** 第二行灰色短语；仅用可算数据（SPEC 表 #10），无数据则整行省略 */
  meta?: string;
  icon: LucideIcon;
  href: string;
  /** 所需权限码（null = 仅需登录） */
  permission: string | null;
}

interface QuickEntrySectionProps {
  /** 本月流水笔数（资金概览同源；无 ledger:read 时为 undefined） */
  monthRecordCount?: number;
  /** 项目待办 summary（待办卡同源；无 project:read 时为 null） */
  todoSummary?: { p0_count: number; max_overdue_days?: number | null } | null;
}

/**
 * 工作台「快捷入口」卡（span 12，设计稿屏 01 第 10 卡）。
 *
 * 设计稿是**一张白卡**内的 2 列 `.q-row` 图标行列表，按子项权限过滤
 * （hifi `.quick-grid` / `.q-row`）。旧实现是两张独立列表卡
 * （装修进度上传 / 销售记录录入），与本稿版式不符，故重写。
 *
 * meta 只展示可算项（SPEC 表 #10）：
 * - 「项目待办」= 逾期天数 + P0 数（来自 todo-board summary）
 * - 「资金流水」= 本月流水笔数（来自 ledger monthly-summary）
 * 其余入口不带 meta（原「进行中 N 场」「今日 N 项」无数据来源，已按 D-08/D-09 删除）。
 */
export function QuickEntrySection({ monthRecordCount, todoSummary }: QuickEntrySectionProps) {
  const { hasPermission, roleCode } = usePermission();

  const todoMeta =
    [
      todoSummary?.max_overdue_days != null ? `逾期 ${todoSummary.max_overdue_days} 天` : null,
      todoSummary && todoSummary.p0_count > 0 ? `P0 ${todoSummary.p0_count}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  // 设计稿 QUICK 表（hifi:1013）：admin 6 项 / operator 4 项 / user 4 项。
  // 每项仍按 permission 硬门控（K15）——角色只是视角，权限才是真门控；
  // user 角色无 project:read / lead:write，故其视角只含业务员入口。
  const staffEntries: QuickEntry[] = [
    {
      label: "新建项目",
      meta: "录入房源或开发项目",
      icon: Plus,
      href: "/admin/projects",
      permission: PERMISSION_CODES.PROJECT_WRITE,
    },
    {
      label: "录入线索",
      meta: "评估价与归属分配",
      icon: Phone,
      href: "/admin/leads/new",
      permission: PERMISSION_CODES.LEAD_WRITE,
    },
    {
      label: "项目待办",
      meta: todoMeta,
      icon: ListChecks,
      href: "/admin/projects/todo-board",
      permission: PERMISSION_CODES.PROJECT_READ,
    },
    {
      label: "资金流水",
      meta: monthRecordCount != null ? `本月 ${monthRecordCount} 笔` : undefined,
      icon: Wallet,
      href: "/admin/ledger",
      permission: PERMISSION_CODES.LEDGER_READ,
    },
    {
      label: "获客活动",
      meta: "活动配置",
      icon: Megaphone,
      href: "/admin/growth-center/campaigns",
      permission: PERMISSION_CODES.RECRUIT_READ,
    },
    {
      label: "订阅模板",
      meta: "微信 5 个入口",
      icon: FileText,
      href: "/admin/settings/subscribe-templates",
      permission: PERMISSION_CODES.API_KEY_MANAGE,
    },
    {
      label: "房源上传",
      meta: "批量导入",
      icon: Upload,
      href: "/admin/properties/upload",
      permission: PERMISSION_CODES.PROPERTY_UPLOAD,
    },
  ];

  /**
   * 业务员视角（设计稿 QUICK.user）。
   *
   * ⚠️ 目标路由必须对 user 角色真实可达：`/admin/projects/todo-board` 与
   * `/admin/leads/new` 在 PATH_PERMISSION_MAP 中要求 project:read / lead:write，
   * 而 user 角色两者皆无（seeds：仅 lead:read/lead:create/property:read 等），
   * 点进去会被 PermissionGuard 弹回。故此处只指向 user 可打开的页面：
   * 线索列表（lead:read）、房源管理（property:read）。
   */
  const userEntries: QuickEntry[] = [
    {
      label: "我的线索",
      meta: "查看与跟进线索",
      icon: Phone,
      href: "/admin/leads",
      permission: PERMISSION_CODES.LEAD_READ,
    },
    {
      label: "房源管理",
      meta: "查房源与小区",
      icon: Building2,
      href: "/admin/properties",
      permission: PERMISSION_CODES.PROPERTY_READ,
    },
  ];

  const entries = roleCode === "user" ? userEntries : staffEntries;

  const visible = entries.filter(
    (entry) => entry.permission == null || hasPermission(entry.permission),
  );

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="快捷入口"
    >
      <WidgetHead title="快捷入口" sub="按子项权限过滤" />

      {visible.length === 0 ? (
        <p className="mt-4 text-xs text-dove">当前账号没有可用的快捷入口</p>
      ) : (
        <div className="mt-1.5 grid grid-cols-1 gap-x-[26px] sm:grid-cols-2">
          {visible.map((entry) => {
            const Icon = entry.icon;
            return (
              <Link
                key={entry.label}
                href={entry.href}
                className="group flex items-center gap-[11px] border-b border-dove/18 px-0.5 py-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-fog text-ash transition-colors group-hover:bg-ink group-hover:text-white">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-[13.5px] font-[450] text-ink">{entry.label}</span>
                  {entry.meta && (
                    <span className="mt-0.5 block truncate text-[11.5px] text-graphite">
                      {entry.meta}
                    </span>
                  )}
                </span>
                <ChevronRight
                  className="ml-auto h-3.5 w-3.5 shrink-0 text-dove"
                  aria-hidden="true"
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
