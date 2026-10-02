"use client";

import { useRouter } from "next/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TodoItemData, TodoProjectCardData } from "../_lib/todo-board-config";
import { ANCHOR_SECTION_ID, P0_COUNT_CHIP_CLASS, PRIORITY_DOT_CLASS, STAGE_CHIP_CLASS } from "../_lib/todo-board-config";
import { TodoDetailBody } from "./todo-detail-popup";

interface TodoProjectCardProps {
  card: TodoProjectCardData;
  /** 当前打开的明细 key（project_id:rule_code），null = 全部关闭；同屏仅一个由视图层收口 */
  openKey: string | null;
  onOpenTodo: (card: TodoProjectCardData, item: TodoItemData) => void;
  onClearTodo: () => void;
}

const POPOVER_SHADOW =
  "shadow-[0_24px_48px_-12px_rgba(23,25,28,0.18),0_0_0_1px_rgba(23,25,28,0.06)]";

/**
 * 单项目待办卡片（设计稿解剖图）：卡头 = 项目名 + 阶段/P0 徽章；
 * 元信息 = 合同号 · 负责人 ·（装修：当前工序）/（签约：业务形式未设置 仅当 null）；
 * 待办行单行 flex（优先级点 + 标题 + hint + 天数徽标）。
 * 两级点击：待办行打开明细弹窗（桌面 Popover），卡片其余区域直达详情页锚点。
 */
export function TodoProjectCard({ card, openKey, onOpenTodo, onClearTodo }: TodoProjectCardProps) {
  const router = useRouter();
  const isMobile = useIsMobile();

  const openCard = () => {
    const anchor = card.todos[0]?.anchor;
    router.push(
      anchor
        ? `/admin/projects/${card.project_id}#${ANCHOR_SECTION_ID[anchor]}`
        : `/admin/projects/${card.project_id}`,
    );
  };

  const metaParts = [
    card.contract_no,
    card.manager?.name,
    // 装修卡：当前工序 · 施工方（有值才显示）；签约卡：业务形式未设置（仅当 null）
    ...(card.status === "renovating"
      ? [card.renovation_stage, card.renovation_company]
      : [card.business_form ? null : "业务形式未设置"]),
  ].filter(Boolean) as string[];

  return (
    <article
      onClick={openCard}
      className="cursor-pointer rounded-cards bg-pure-white px-[18px] pt-4 pb-3 shadow-steep transition-transform duration-200 hover:-translate-y-[3px]"
    >
      {/* 卡头 */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <div className="truncate text-[15px] font-[480] text-ink">{card.community_name}</div>
          <div className="mt-[5px] truncate text-xs font-[430] text-dove">
            {metaParts.map((part, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1">·</span>}
                {i === 0 ? (
                  <span className="font-mono text-[11px] text-graphite">{part}</span>
                ) : i === 1 ? (
                  <b className="font-[450] text-graphite">{part}</b>
                ) : (
                  <span>{part}</span>
                )}
              </span>
            ))}
          </div>
        </div>
        <div className="flex shrink-0 gap-[5px] pt-px">
          <span className={STAGE_CHIP_CLASS[card.status]}>{card.status === "signing" ? "签约" : "装修"}</span>
          {card.p0_count > 0 && (
            <span className={P0_COUNT_CHIP_CLASS}>P0 × {card.p0_count}</span>
          )}
        </div>
      </div>

      {/* 待办清单 */}
      <div className="mt-2.5 border-t border-[#f0f0f2] pt-2">
        {card.todos.map((item) => {
          const key = `${card.project_id}:${item.rule_code}`;
          const row = (
            <button
              type="button"
              onClick={(e) => {
                // 两级点击收口：行点击只开明细，不冒泡到卡片跳转
                e.stopPropagation();
                onOpenTodo(card, item);
              }}
              className="flex w-full items-center gap-2 rounded-[10px] px-2 py-[7px] text-left transition-colors hover:bg-fog"
            >
              <span className={PRIORITY_DOT_CLASS[item.priority]} />
              <span className="max-w-[62%] shrink-0 truncate text-[13px] font-[480] text-ink">
                {item.title}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-[430] text-graphite">
                {item.hint}
              </span>
              {item.days_label && (
                <span
                  className={cn(
                    "shrink-0 text-xs tabular-nums",
                    item.days_hot ? "font-[480] text-rust" : "text-graphite",
                  )}
                >
                  {item.days_label}
                </span>
              )}
            </button>
          );

          if (isMobile) {
            return <div key={key}>{row}</div>;
          }
          return (
            <Popover
              key={key}
              open={openKey === key}
              onOpenChange={(open) => (open ? onOpenTodo(card, item) : onClearTodo())}
            >
              <PopoverTrigger asChild>{row}</PopoverTrigger>
              <PopoverContent
                side="bottom"
                align="start"
                collisionPadding={12}
                className={cn(
                  "w-[336px] rounded-[16px] border-none p-0",
                  /* 关闭时禁用 exit 动画：CSS 动画不运行的环境（自动化测试、系统动画禁用）里
                     Radix Presence 等不到 animationend 会永久挂起 DOM；
                     animation-name 为 none 时 Presence 立即卸载。打开动画不受影响。 */
                  "data-[state=closed]:animate-none!",
                  POPOVER_SHADOW,
                )}
              >
                <TodoDetailBody card={card} item={item} onClose={onClearTodo} />
              </PopoverContent>
            </Popover>
          );
        })}
        {card.todo_overflow > 0 && (
          <div className="mx-[-4px] mt-1 flex items-center gap-[7px] rounded-[10px] bg-[#eef0f3] px-3 py-1.5 text-xs font-[450] text-graphite">
            <span className="font-mono text-[#6b6e76]">+ {card.todo_overflow}</span>
            还有 {card.todo_overflow} 件待办，进详情查看
          </div>
        )}
      </div>
    </article>
  );
}
