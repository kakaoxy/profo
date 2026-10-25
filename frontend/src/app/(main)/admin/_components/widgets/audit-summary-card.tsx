import type { components } from "@/lib/api-types";
import { WidgetHead } from "./widget-head";
import { WgKpi } from "./wg-kpi";

type OperationLogSummary = components["schemas"]["OperationLogSummaryResponse"];
type ActionCountItem = components["schemas"]["ActionCountItem"];

interface AuditSummaryCardProps {
  summary: OperationLogSummary | null;
  /** 最近 3 条高风险动作候选（= 敏感数据访问日志），无则空数组 */
  sensitiveItems: components["schemas"]["OperationLogResponse"][];
}

/** action 原值 → 中文展示名（仅常见项，未知直接显示原值） */
const ACTION_LABELS: Record<string, string> = {
  create: "新增",
  update: "修改",
  delete: "删除",
  sensitive_data_access: "敏感访问",
  login_failure: "登录失败",
  login_success: "登录成功",
  assign_role: "分配角色",
  remove_role: "移除角色",
};

/**
 * 工作台「审计概览」卡（span 6，仅 admin，设计稿屏 01 第 7 卡）。
 *
 * 版式对齐 hifi `.kpi-3` + `.wg-split.narrow-right`（3fr / 2fr）：
 * 上排三指标，下排左「最近敏感动作」mini-list、右「今日操作分布」胶囊条。
 *
 * 只展示可算指标（SPEC D-03 / D-10）：
 * - 今日操作数 / 登录失败数 / 按 action 原值聚合
 *
 * ⚠️ **无「高风险」指标**：`operation_logs` 无风险等级列，业务中不存在该概念；
 *    设计稿原「高风险 3」已按 D-03 改为「敏感访问」（= sensitive_data_access 计数）。
 * ⚠️ **无「查询」分类**：审计只记录写操作与敏感读，普通查询不落库。
 */
export function AuditSummaryCard({ summary, sensitiveItems }: AuditSummaryCardProps) {
  const distribution: ActionCountItem[] = summary?.action_distribution ?? [];
  const maxCount = Math.max(1, ...distribution.map((item) => item.count));
  const sensitiveCount = distribution.find((d) => d.action === "sensitive_data_access")?.count ?? 0;

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="审计概览"
    >
      <WidgetHead title="审计概览" sub="今日" link="审计日志" href="/admin/audit-logs" />

      <div className="mt-[18px] grid grid-cols-3 gap-4">
        <WgKpi label="操作总数" value={summary?.today_total ?? 0} detail="今日" />
        <WgKpi
          label="敏感访问"
          value={sensitiveCount}
          detail="导出/银行卡"
          valueClassName="text-rust"
        />
        <WgKpi label="登录失败" value={summary?.login_failure_count ?? 0} detail="今日" />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <ul>
            {sensitiveItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2.5 border-b border-dove/18 py-[9px] last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-[450] text-ink">
                    {ACTION_LABELS[item.action] ?? item.action}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-graphite">
                    {item.resource_type}
                    {item.ip ? ` · ${item.ip}` : ""}
                  </span>
                </span>
                <span className="ml-auto shrink-0 rounded-full bg-apricot-wash px-2 py-0.5 text-[11.5px] text-rust">
                  敏感访问
                </span>
              </li>
            ))}
            {sensitiveItems.length === 0 && (
              <li className="py-2 text-xs text-dove">今日无敏感数据访问</li>
            )}
          </ul>
        </div>

        <div className="min-w-0">
          <p className="mb-2.5 text-xs text-graphite">今日操作分布</p>
          <ul>
            {distribution.map((item) => (
              <li key={item.action} className="flex items-center gap-2.5 py-[7px]">
                <span className="w-16 shrink-0 truncate text-[12.5px] text-ash">
                  {ACTION_LABELS[item.action] ?? item.action}
                </span>
                <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-fog">
                  <i
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.round((item.count / maxCount) * 100)}%`,
                      backgroundColor:
                        item.action === "sensitive_data_access"
                          ? "var(--color-rust)"
                          : "var(--color-ink)",
                      opacity: item.action === "sensitive_data_access" ? 1 : 0.22,
                    }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[12.5px] tabular-nums text-ink">
                  {item.count}
                </span>
              </li>
            ))}
            {distribution.length === 0 && <li className="text-xs text-dove">今日暂无操作</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
