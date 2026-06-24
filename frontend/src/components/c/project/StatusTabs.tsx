"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "在售", label: "在售房源" },
  { value: "在途", label: "即将上架" },
  { value: "已售", label: "过往案例" },
] as const;

interface StatusTabsProps {
  value: string;
  onStatusChange: (status: string) => void;
  total?: number;
}

export function StatusTabs({ value, onStatusChange, total }: StatusTabsProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dove/30">
      <Tabs value={value} onValueChange={onStatusChange}>
        <TabsList className="h-auto gap-0 rounded-none bg-transparent p-0">
          {TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-5 py-3 text-[15px] font-medium text-graphite shadow-none transition-colors hover:text-ink data-[state=active]:border-ink data-[state=active]:bg-transparent data-[state=active]:text-ink data-[state=active]:shadow-none"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {total !== undefined && (
        <span className="hidden shrink-0 text-sm text-graphite md:block">
          共 <span className="font-medium text-ink">{total}</span> 套精选房源
        </span>
      )}
    </div>
  );
}
