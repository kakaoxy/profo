"use client";

import useSWR from "swr";
import { Loader2, RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { fetchReceivablePayable } from "@/app/(main)/admin/ledger/actions";
import { formatCurrency } from "@/app/(main)/admin/ledger/[projectId]/statistics/_components/format";
import type { components } from "@/lib/api-types";

type ReceivablePayableItem = components["schemas"]["ReceivablePayableItem"];
type ReceivablePayableResponse = components["schemas"]["ReceivablePayableResponse"];

interface ReceivablePayableTableProps {
  projectId: string;
  /** 联动记一笔的收支状态：只渲染对应分区 */
  transactionType: "expense" | "income";
  /** 业务模式：用于按业务类型筛选（general 始终显示，再叠加对应业务类型） */
  businessForm?: "agent" | "wholesale" | null;
}

// 按 stage 分组：签约 → 装修 → 在售 → 已售 → 其他（符合项目生命周期心智）
const STAGE_ORDER = ["签约", "装修", "在售", "已售", "其他"] as const;

// Stage 视觉锚点：色点 + 标签
const STAGE_VISUALS: Record<string, { dot: string }> = {
  签约: { dot: "bg-rust" },
  装修: { dot: "bg-apricot-wash" },
  在售: { dot: "bg-sky-wash" },
  已售: { dot: "bg-ink" },
  其他: { dot: "bg-graphite" },
};

const SECTION_DEFS: { type: "expense" | "income"; title: string }[] = [
  { type: "expense", title: "应付已付" },
  { type: "income", title: "应收已收" },
];

/** SWR fetcher：调用 Server Action 并解包 ActionResult */
async function fetcher(
  projectId: string,
): Promise<ReceivablePayableResponse> {
  const res = await fetchReceivablePayable(projectId);
  if (res.success) {
    return res.data;
  }
  throw new Error(res.message || "加载应收应付数据失败");
}

/** 按 stage 分组，顺序遵循 STAGE_ORDER */
function groupByStage(
  items: ReceivablePayableItem[],
): { stage: string; items: ReceivablePayableItem[] }[] {
  const groups: { stage: string; items: ReceivablePayableItem[] }[] = [];
  for (const stage of STAGE_ORDER) {
    const matched = items.filter((i) => i.stage === stage);
    if (matched.length > 0) {
      groups.push({ stage, items: matched });
    }
  }
  // 兜底：未定义的 stage 追加到末尾
  const knownSet = new Set<string>(STAGE_ORDER);
  const others = items.filter((i) => !knownSet.has(i.stage));
  const otherStages = Array.from(new Set(others.map((i) => i.stage)));
  for (const s of otherStages) {
    groups.push({ stage: s, items: others.filter((i) => i.stage === s) });
  }
  return groups;
}

/** 差额状态 → badge 样式（色彩 + 背景） */
function getDifferenceBadge(
  diff: number | null | undefined,
): { label: string; className: string } {
  if (diff == null) {
    return {
      label: "无预期",
      className: "bg-transparent text-dove",
    };
  }
  if (diff === 0) {
    return {
      label: "已结清",
      className: "bg-fog text-graphite",
    };
  }
  if (diff > 0) {
    return {
      label: `差 ${formatCurrency(diff)}`,
      className: "bg-apricot-wash/60 text-rust",
    };
  }
  return {
    label: `多 ${formatCurrency(Math.abs(diff))}`,
    className: "bg-sky-wash/60 text-ink",
  };
}

/** 计算逻辑文本是否需要淡化 */
function isCalculationLogicFaded(logic: string): boolean {
  return logic === "无" || logic === "—";
}

/**
 * 格式化计算逻辑文本：将小数比例转为百分数，更符合业务直觉。
 * 例如 "签约价格*0.01（最高40000）" → "签约价格*1%（最高40000）"
 *      "成交总价*0.005"          → "成交总价*0.5%"
 * 注意：先替换 0.005 再替换 0.01，避免短串误匹配。
 */
function formatCalculationLogic(logic: string): string {
  return logic
    .replaceAll("0.005", "0.5%")
    .replaceAll("0.01", "1%");
}

/** 格式化金额，null 返回 "—" */
function formatAmount(
  value: number | null | undefined,
  treatNullAsZero = false,
): string {
  if (value == null) {
    return treatNullAsZero ? formatCurrency(0) : "—";
  }
  return formatCurrency(value);
}

export function ReceivablePayableTable({
  projectId,
  transactionType,
  businessForm,
}: ReceivablePayableTableProps) {
  const { data, error, isLoading, mutate } = useSWR<ReceivablePayableResponse>(
    ["receivable-payable", projectId, transactionType],
    () => fetcher(projectId),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-10">
        <Loader2 className="h-4 w-4 animate-spin text-graphite" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-10">
        <p className="text-sm text-graphite">
          {error.message || "加载应收应付数据失败"}
        </p>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => mutate()}
          className="rounded-full border-dove/40 text-ink hover:bg-fog"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          重试
        </Button>
      </div>
    );
  }

  const items = data?.items ?? [];
  const section = SECTION_DEFS.find((s) => s.type === transactionType);
  if (!section) return null;

  // 按业务模式筛选：general 始终显示，再叠加对应业务类型
  const allowedBusinessTypes = new Set<string>(["general"]);
  if (businessForm === "agent") allowedBusinessTypes.add("agent");
  if (businessForm === "wholesale") allowedBusinessTypes.add("wholesale");

  const sectionItems = items.filter(
    (i) =>
      i.type === section.type &&
      allowedBusinessTypes.has(i.business_type),
  );
  const groups = groupByStage(sectionItems);
  const totalCount = sectionItems.length;

  return (
    <div className="flex max-h-[calc(80vh-120px)] flex-col overflow-hidden">
      {/* 分区标题 + 计数 */}
      <div className="mb-3 flex shrink-0 items-baseline justify-between">
        <h3 className="text-[15px] font-medium tracking-[-0.009em] text-ink">
          {section.title}
        </h3>
        <span className="text-[11px] font-medium uppercase tracking-[0.5px] text-graphite">
          {totalCount} 项
        </span>
      </div>

      <div className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2">
        {groups.length === 0 ? (
          <p className="py-8 text-center text-xs text-graphite">暂无数据</p>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const visual = STAGE_VISUALS[group.stage] ?? STAGE_VISUALS.其他;
              const groupTotal = group.items.reduce(
                (sum, i) => sum + (i.actual_amount ?? 0),
                0,
              );
              return (
                <section key={`${section.type}-${group.stage}`}>
                  {/* Stage 分组标题：色点 + 名称 + 小计 */}
                  <div className="mb-2 flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          visual.dot,
                        )}
                      />
                      <h4 className="text-[11px] font-medium uppercase tracking-[0.5px] text-ink">
                        {group.stage}
                      </h4>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-graphite">
                      {formatCurrency(groupTotal)}
                    </span>
                  </div>

                  {/* 项目卡片列表 */}
                  <div className="flex flex-col gap-1.5">
                    {group.items.map((item) => {
                      const logicFaded = isCalculationLogicFaded(
                        item.calculation_logic,
                      );
                      const badge = getDifferenceBadge(item.difference);
                      const expected = item.expected_amount;
                      const actual = item.actual_amount;
                      const logicText = formatCalculationLogic(
                        item.calculation_logic,
                      );
                      return (
                        <div
                          key={`${section.type}-${group.stage}-${item.category}`}
                          className="rounded-[12px] bg-fog/60 px-3 py-2 transition-colors hover:bg-fog"
                        >
                          {/* 第一行：项目名 + 计算逻辑 */}
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-medium tracking-[-0.009em] text-ink">
                              {item.category_label || "—"}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 text-[11px]",
                                logicFaded ? "text-dove" : "text-graphite",
                              )}
                            >
                              {logicText || "—"}
                            </span>
                          </div>

                          {/* 第二行：预期 · 实际 · 差额 badge */}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <div className="flex items-baseline gap-1.5 font-mono text-[12px] tabular-nums">
                              <span className="text-graphite">
                                {formatAmount(expected)}
                              </span>
                              <span className="text-dove">/</span>
                              <span className="text-ink">
                                {formatAmount(actual, true)}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
                                badge.className,
                              )}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReceivablePayableTable;
