"use client";

import { useState, useRef, useCallback } from "react";
import { FileText, Camera } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabValue = "progress" | "contract";

interface RenovationTabsProps {
  children: (props: {
    activeTab: TabValue;
    progressRef: React.RefObject<HTMLDivElement | null>;
    contractRef: React.RefObject<HTMLDivElement | null>;
  }) => React.ReactNode;
  defaultTab?: TabValue;
}

const tabsConfig = [
  { value: "progress" as TabValue, label: "装修进度", icon: Camera },
  { value: "contract" as TabValue, label: "合同信息", icon: FileText },
] as const;

export function RenovationTabs({
  children,
  defaultTab = "progress",
}: RenovationTabsProps) {
  const [activeTab, setActiveTab] = useState<TabValue>(defaultTab);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const contractRef = useRef<HTMLDivElement>(null);

  const handleTabChange = useCallback(
    (value: string) => {
      const newTab = value as TabValue;

      if (newTab === activeTab) return;

      // 保存当前标签页的滚动位置
      if (activeTab === "progress" && progressRef.current) {
        sessionStorage.setItem(
          `renovation-progress-scroll-${window.location.pathname}`,
          String(progressRef.current.scrollTop)
        );
      } else if (activeTab === "contract" && contractRef.current) {
        sessionStorage.setItem(
          `renovation-contract-scroll-${window.location.pathname}`,
          String(contractRef.current.scrollTop)
        );
      }

      // 开始过渡动画
      setIsTransitioning(true);

      // 延迟切换标签，让淡出动画完成
      setTimeout(() => {
        setActiveTab(newTab);

        // 恢复目标标签页的滚动位置
        requestAnimationFrame(() => {
          if (newTab === "progress" && progressRef.current) {
            const savedScroll = sessionStorage.getItem(
              `renovation-progress-scroll-${window.location.pathname}`
            );
            if (savedScroll) {
              progressRef.current.scrollTop = parseInt(savedScroll, 10);
            }
          } else if (newTab === "contract" && contractRef.current) {
            const savedScroll = sessionStorage.getItem(
              `renovation-contract-scroll-${window.location.pathname}`
            );
            if (savedScroll) {
              contractRef.current.scrollTop = parseInt(savedScroll, 10);
            }
          }

          // 淡入动画完成后重置状态
          setTimeout(() => {
            setIsTransitioning(false);
          }, 200);
        });
      }, 150);
    },
    [activeTab]
  );

  return (
    <div className="space-y-6">
      {/* 标签页导航 */}
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2">
          {tabsConfig.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="flex items-center justify-center gap-2"
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 内容区域 */}
      <div
        className={cn(
          "relative min-h-[400px] transition-all duration-200 ease-out",
          isTransitioning
            ? "opacity-0 translate-y-2"
            : "opacity-100 translate-y-0"
        )}
      >
        {children({
          activeTab,
          progressRef,
          contractRef,
        })}
      </div>
    </div>
  );
}

export type { TabValue };
