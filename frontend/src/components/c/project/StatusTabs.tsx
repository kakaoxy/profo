"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "在售", label: "在售" },
  { value: "在途", label: "在途" },
  { value: "已售", label: "已售" },
] as const;

interface StatusTabsProps {
  value: string;
  onStatusChange: (status: string) => void;
}

export function StatusTabs({ value, onStatusChange }: StatusTabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={onStatusChange}
      className="w-full"
    >
      <TabsList className="bg-transparent h-auto p-0 gap-2 w-full justify-start rounded-none">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="rounded-full border-0 px-4 py-2 text-sm font-medium text-graphite hover:text-ink data-[state=active]:text-white data-[state=active]:bg-ink data-[state=active]:shadow-none transition-colors"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
