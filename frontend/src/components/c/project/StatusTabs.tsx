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
      <TabsList className="bg-transparent h-auto p-0 gap-0 w-full justify-start border-b border-c-border-subtle rounded-none">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="relative rounded-none border-0 px-4 py-3 text-sm font-medium text-c-text-secondary hover:text-c-trust-blue data-[state=active]:text-c-trust-blue data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-transparent data-[state=active]:after:bg-c-trust-blue after:transition-colors"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
