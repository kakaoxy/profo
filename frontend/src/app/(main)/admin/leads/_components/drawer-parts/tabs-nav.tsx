import React from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabId = "info" | "monitor";

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isMonitorFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

/** 详情抽屉页签：细下划线，不使用胶囊。 */
export const TabsNav: React.FC<Props> = ({
  activeTab,
  onTabChange,
  isMonitorFullscreen,
  onToggleFullscreen,
}) => {
  const tabs: { id: TabId; label: string }[] = [
    { id: "info", label: "信息与审核" },
    { id: "monitor", label: "监控看板" },
  ];

  return (
    <div className="mt-5 flex shrink-0 items-end justify-between border-b border-dove/30 px-6 sm:px-7">
      <div className="flex gap-6" role="tablist" aria-label="线索详情页签">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "relative pb-2.5 text-[12px] transition-colors",
              activeTab === tab.id
                ? "font-medium text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-ink"
                : "text-graphite hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === "monitor" && onToggleFullscreen ? (
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="mb-2 inline-flex items-center gap-1.5 text-[10px] text-graphite hover:text-ink"
        >
          {isMonitorFullscreen ? (
            <>
              <Minimize2 className="h-3 w-3" /> 退出全屏
            </>
          ) : (
            <>
              <Maximize2 className="h-3 w-3" /> 全屏
            </>
          )}
        </button>
      ) : null}
    </div>
  );
};
