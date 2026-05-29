"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterValues {
  minPrice: string;
  maxPrice: string;
  layout: string;
  minArea: string;
  maxArea: string;
}

interface FilterPanelProps {
  onApply: (filters: FilterValues) => void;
  onReset: () => void;
  initialFilters: FilterValues;
}

const LAYOUT_OPTIONS = [
  { value: "1室", label: "1室" },
  { value: "2室", label: "2室" },
  { value: "3室", label: "3室" },
  { value: "4室", label: "4室" },
  { value: "5室及以上", label: "5室及以上" },
];

export function FilterPanel({
  onApply,
  onReset,
  initialFilters,
}: FilterPanelProps) {
  const [minPrice, setMinPrice] = useState(initialFilters.minPrice);
  const [maxPrice, setMaxPrice] = useState(initialFilters.maxPrice);
  const [layout, setLayout] = useState(initialFilters.layout);
  const [minArea, setMinArea] = useState(initialFilters.minArea);
  const [maxArea, setMaxArea] = useState(initialFilters.maxArea);

  const handleApply = () => {
    onApply({ minPrice, maxPrice, layout, minArea, maxArea });
  };

  const handleReset = () => {
    setMinPrice("");
    setMaxPrice("");
    setLayout("");
    setMinArea("");
    setMaxArea("");
    onReset();
  };

  return (
    <div className="bg-white rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle p-4 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-c-text-primary">
          价格范围（万）
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="最低总价"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          />
          <span className="text-c-text-secondary shrink-0">—</span>
          <input
            type="number"
            placeholder="最高总价"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-c-text-primary">
          户型
        </label>
        <Select value={layout || undefined} onValueChange={setLayout}>
          <SelectTrigger className="w-full h-10 rounded-lg border-c-border-subtle bg-white text-sm text-c-text-primary focus-visible:ring-c-trust-blue/10 focus-visible:border-c-trust-blue/30">
            <SelectValue placeholder="选择户型" />
          </SelectTrigger>
          <SelectContent>
            {LAYOUT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-c-text-primary">
          面积范围（m²）
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="最小面积"
            value={minArea}
            onChange={(e) => setMinArea(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          />
          <span className="text-c-text-secondary shrink-0">—</span>
          <input
            type="number"
            placeholder="最大面积"
            value={maxArea}
            onChange={(e) => setMaxArea(e.target.value)}
            className="w-full h-10 px-3 rounded-lg border border-c-border-subtle bg-white text-sm text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/10 focus:border-c-trust-blue/30 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleReset}
          className="flex-1 h-10 rounded-lg border border-c-border-subtle text-sm font-medium text-c-text-secondary hover:text-c-text-primary hover:border-c-text-primary/30 transition-colors"
        >
          重置
        </button>
        <button
          onClick={handleApply}
          className="flex-1 h-10 rounded-lg bg-c-trust-blue text-sm font-medium text-white hover:bg-c-trust-blue/90 transition-colors"
        >
          确认
        </button>
      </div>
    </div>
  );
}
