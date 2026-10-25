/**
 * 工作台 widget 注册表（迭代二 SPEC §8.3）
 *
 * 唯一事实源：12 个 widget 的 key / 中文名 / 所需权限 / 默认栅格宽度。
 * - span 由本注册表决定，**不存布局 JSON**（K14：避免布局破坏栅格）；
 * - 与后端 `services/system/workbench_registry.py` 的 key/roles/permission 必须一致；
 * - 后端的 `default_span` 只用于布局管理页展示，渲染宽度以本文件为准。
 */

import { PERMISSION_CODES } from "@/lib/auth/permissions";

export interface WorkbenchWidgetMeta {
  /** 注册表 key，与后端一致 */
  key: string;
  /** 中文名 */
  label: string;
  /** 12 栏栅格宽度 */
  span: 3 | 6 | 12;
  /** 所需权限码；null 表示仅需登录 */
  permission: string | null;
  /** 可见角色（与后端 roles 白名单一致），用于前端二次兜底 */
  roles: readonly ("admin" | "operator" | "user")[];
}

/** 12 个 widget（顺序与设计稿矩阵一致） */
export const WORKBENCH_WIDGETS: Record<string, WorkbenchWidgetMeta> = {
  project_overview: {
    key: "project_overview",
    label: "项目总览",
    span: 3,
    permission: PERMISSION_CODES.PROJECT_READ,
    roles: ["admin", "operator"],
  },
  leads_funnel: {
    key: "leads_funnel",
    label: "线索漏斗",
    span: 3,
    permission: PERMISSION_CODES.LEAD_READ,
    roles: ["admin", "operator"],
  },
  alert_card: {
    key: "alert_card",
    label: "待评估提醒",
    span: 3,
    permission: PERMISSION_CODES.LEAD_WRITE,
    roles: ["admin", "operator"],
  },
  todo_board_summary: {
    key: "todo_board_summary",
    label: "项目待办",
    span: 3,
    permission: PERMISSION_CODES.PROJECT_READ,
    roles: ["admin", "operator"],
  },
  growth_overview: {
    key: "growth_overview",
    label: "获客总览",
    span: 6,
    permission: PERMISSION_CODES.RECRUIT_READ,
    roles: ["admin", "operator"],
  },
  finance_summary: {
    key: "finance_summary",
    label: "资金概览",
    span: 6,
    permission: PERMISSION_CODES.LEDGER_READ,
    roles: ["admin"],
  },
  audit_summary: {
    key: "audit_summary",
    label: "审计概览",
    span: 6,
    permission: PERMISSION_CODES.OPERATION_LOG_READ,
    roles: ["admin"],
  },
  monitor_projects: {
    key: "monitor_projects",
    label: "重点监控项目",
    span: 12,
    permission: PERMISSION_CODES.PROJECT_READ,
    roles: ["admin", "operator"],
  },
  leads_table: {
    key: "leads_table",
    label: "最近线索",
    span: 12,
    permission: PERMISSION_CODES.LEAD_READ,
    roles: ["admin", "operator"],
  },
  quick_entry: {
    key: "quick_entry",
    label: "快捷入口",
    span: 12,
    permission: null,
    roles: ["admin", "operator", "user"],
  },
  my_projects: {
    key: "my_projects",
    label: "我负责的项目",
    span: 12,
    permission: null,
    roles: ["user"],
  },
  my_todos: {
    key: "my_todos",
    label: "我的待办",
    span: 12,
    permission: null,
    roles: ["user"],
  },
};

/** 按 key 取注册信息（未知 key 返回 undefined，调用方跳过渲染） */
export function getWidget(key: string): WorkbenchWidgetMeta | undefined {
  return WORKBENCH_WIDGETS[key];
}

/**
 * 计算渲染时的实际栅格宽度：6 栏卡若在当前可见序列中落单（未成对），升为满宽。
 *
 * 设计稿补充口径 a：避免 12 栏栅格出现空洞。**只影响渲染，不改布局 JSON**。
 *
 * @param keys 已启用且已按 order 排序的 widget key 列表
 * @returns key → 实际 span
 */
export function resolveSpans(keys: readonly string[]): Map<string, 3 | 6 | 12> {
  const result = new Map<string, 3 | 6 | 12>();
  let pendingSix: string | null = null;

  for (const key of keys) {
    const meta = getWidget(key);
    if (!meta) continue;
    if (meta.span === 6) {
      if (pendingSix) {
        result.set(pendingSix, 6);
        result.set(key, 6);
        pendingSix = null;
      } else {
        pendingSix = key;
      }
    } else {
      if (pendingSix) {
        result.set(pendingSix, 12);
        pendingSix = null;
      }
      result.set(key, meta.span);
    }
  }
  if (pendingSix) result.set(pendingSix, 12);
  return result;
}

/** 栅格宽度 → Tailwind 类名（12 栏栅格） */
export function spanToClassName(span: 3 | 6 | 12): string {
  if (span === 3) return "col-span-12 lg:col-span-3";
  if (span === 6) return "col-span-12 lg:col-span-6";
  return "col-span-12";
}
