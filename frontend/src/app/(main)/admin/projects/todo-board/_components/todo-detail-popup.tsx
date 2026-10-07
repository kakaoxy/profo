"use client";

import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import type { TodoItemData, TodoProjectCardData } from "../_lib/todo-board-config";
import {
  ANCHOR_LABEL,
  ANCHOR_SECTION_ID,
  PRIORITY_CHIP_CLASS,
  PRIORITY_DOT_CLASS,
} from "../_lib/todo-board-config";

interface TodoDetailBodyProps {
  card: TodoProjectCardData;
  item: TodoItemData;
  onClose: () => void;
}

/** items[] 条目：「：」前字段名/关键值用 rust 强调（对齐设计稿 .pp-item b） */
function DetailItem({ text }: { text: string }) {
  const idx = text.indexOf("：");
  if (idx === -1) return <span>{text}</span>;
  return (
    <>
      <b className="font-[480] text-rust">{text.slice(0, idx + 1)}</b>
      <span>{text.slice(idx + 1)}</span>
    </>
  );
}

/**
 * 弹窗主体（设计稿 03-C）：头部 = 优先级点 + 标题 + 优先级徽章 + ✕；
 * 副行 = 项目名 + 合同号；主体 = 「缺失明细」+ items[] 逐条；
 * 底部 = 「→ 详情页 · {分区名}」mono 小字 + 「去项目详情」Ink 填充胶囊。
 * 桌面 Popover 与移动端 Sheet 共用同一数据源与结构。
 */
export function TodoDetailBody({ card, item, onClose }: TodoDetailBodyProps) {
  const router = useRouter();

  const goDetail = () => {
    onClose();
    router.push(`/admin/projects/${card.project_id}#${ANCHOR_SECTION_ID[item.anchor]}`);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-1">
        <span className={PRIORITY_DOT_CLASS[item.priority]} />
        <span className="min-w-0 flex-1 truncate text-sm font-[480] text-ink">{item.title}</span>
        <span className={PRIORITY_CHIP_CLASS[item.priority]}>{item.priority.toUpperCase()}</span>
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[15px] leading-none text-graphite transition-colors hover:bg-fog"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 pb-2.5 text-[11px] text-dove">
        <b className="font-[480] text-graphite">{card.community_name}</b>
        <span className="ml-1">· {card.contract_no ?? "—"}</span>
      </div>
      <div className="flex min-h-0 flex-col gap-[7px] border-t border-[#f0f0f2] px-4 pt-1 pb-3.5">
        <div className="mt-2.5 text-[11px] font-[500] tracking-[0.06em] text-graphite">
          缺失明细
        </div>
        {(item.items ?? []).map((text, i) => (
          <div key={i} className="flex gap-2 text-[12.5px] leading-[1.55] font-[430] text-ash">
            <span className="font-[500] text-dove">·</span>
            <span className="min-w-0">
              <DetailItem text={text} />
            </span>
          </div>
        ))}
        {(item.items ?? []).length === 0 && item.hint ? (
          <div className="flex gap-2 text-[12.5px] leading-[1.55] font-[430] text-ash">
            <span className="font-[500] text-dove">·</span>
            <span>{item.hint}</span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2.5 border-t border-[#f0f0f2] bg-fog px-4 py-3">
        <span className="min-w-0 truncate font-mono text-[10.5px] text-graphite">
          → 详情页 · {ANCHOR_LABEL[item.anchor]}
        </span>
        <button
          type="button"
          onClick={goDetail}
          className="shrink-0 rounded-full bg-ink px-[18px] py-2 text-[12.5px] font-[450] tracking-[-0.009em] text-pure-white transition-colors hover:bg-[#2a2d31]"
        >
          去项目详情
        </button>
      </div>
    </div>
  );
}

interface TodoDetailSheetProps {
  active: { card: TodoProjectCardData; item: TodoItemData } | null;
  onClose: () => void;
}

/** 移动端（<md）底部 Sheet 弹窗；桌面端由卡片内 Popover 承担，本组件不渲染 */
export function TodoDetailSheet({ active, onClose }: TodoDetailSheetProps) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={isMobile && !!active} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn("w-full gap-0 rounded-t-[20px] p-0", "max-h-[85vh] overflow-y-auto")}
      >
        {active && <TodoDetailBody card={active.card} item={active.item} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}
