"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";

import type { ViewMode } from "../../../_components/project-detail/constants";
import {
  PROJECT_SECTION_IDS,
  getSectionNavItems,
  type SectionNavCounts,
  type SectionNavItem,
} from "./config";

interface SectionNavProps {
  viewMode: ViewMode;
  /** 计数徽标（签约文书数 / 在售三类销售记录数，由页面层状态传入） */
  counts?: SectionNavCounts;
  /** 带 tabKey 条目点击时先切换视图内 tab（在售销售动态联动） */
  onTabSelect?: (tabKey: string) => void;
}

/** 条目唯一标识（同一锚点 id 的多 tab 条目以 tabKey 区分选中态） */
function itemKey(item: SectionNavItem): string {
  return item.tabKey ? `${item.id}:${item.tabKey}` : item.id;
}

/**
 * Sticky 分区导航（V4）：条目与计数徽标按 viewMode 动态生成（已下架不渲染），
 * 带 tabKey 的条目先联动视图内 tab 再锚点滚动；桌面吸附视口顶部（外壳无固定头），
 * 移动端吸附于全局 header（h-14）下方。
 */
export function SectionNav({ viewMode, counts, onTabSelect }: SectionNavProps) {
  const items = getSectionNavItems(viewMode, counts);
  const [activeId, setActiveId] = useState<string>(
    items[0] ? itemKey(items[0]) : PROJECT_SECTION_IDS.overview,
  );

  const handleSelect = useCallback(
    (item: SectionNavItem) => {
      setActiveId(itemKey(item));
      // 锚点元素不存在时（如装修进度 tab 未挂载）回落到概览 section
      const scrollToSection = () => {
        const target =
          document.getElementById(item.id) ?? document.getElementById(PROJECT_SECTION_IDS.overview);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      // 带 tabKey 条目：先联动视图内 tab，延迟滚动等待 TabsContent 挂载与过渡完成
      // （Radix 未激活 TabsContent 不挂载；装修视图自身有 150ms 过渡 + rAF，300ms 足够）
      if (item.tabKey) {
        onTabSelect?.(item.tabKey);
        setTimeout(scrollToSection, 300);
        return;
      }
      scrollToSection();
    },
    [onTabSelect],
  );

  if (items.length === 0) return null;

  return (
    <div className="sticky top-14 z-30 bg-[linear-gradient(var(--color-fog)_82%,transparent)] pb-3.5 pt-1.5 md:top-0">
      <nav
        aria-label="项目详情分区导航"
        className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-pure-white p-1 shadow-steep-sm"
      >
        {items.map((item) => {
          const active = itemKey(item) === activeId;
          return (
            <button
              key={itemKey(item)}
              type="button"
              onClick={() => handleSelect(item)}
              className={cn(
                "whitespace-nowrap rounded-full px-4 py-2 text-sm font-[450] text-graphite transition-colors hover:text-ink",
                active && "bg-ink text-pure-white hover:text-pure-white",
              )}
            >
              {item.label}
              {typeof item.count === "number" && (
                <span className={cn("ml-1 text-xs", active ? "text-white/55" : "text-dove")}>
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
