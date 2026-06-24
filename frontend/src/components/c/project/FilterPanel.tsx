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
    <div className="bg-white rounded-cards shadow-steep p-5 space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-ink">
          价格范围（万）
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="最低总价"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full h-10 px-3 rounded-inputs border border-dove/30 bg-white text-sm text-ink placeholder:text-graphite focus:outline-none focus:ring-2 focus:ring-rust/10 focus:border-rust/30 transition-all"
          />
          <span className="text-graphite shrink-0">—</span>
          <input
            type="number"
            placeholder="最高总价"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-full h-10 px-3 rounded-inputs border border-dove/30 bg-white text-sm text-ink placeholder:text-graphite focus:outline-none focus:ring-2 focus:ring-rust/10 focus:border-rust/30 transition-all"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-ink">
          户型
        </label>
        <Select value={layout || undefined} onValueChange={setLayout}>
          <SelectTrigger className="w-full h-10 rounded-inputs border-dove/30 bg-white text-sm text-ink focus-visible:ring-rust/10 focus-visible:border-rust/30">
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
        <label className="text-sm font-medium text-ink">
          面积范围（m²）
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            placeholder="最小面积"
            value={minArea}
            onChange={(e) => setMinArea(e.target.value)}
            className="w-full h-10 px-3 rounded-inputs border border-dove/30 bg-white text-sm text-ink placeholder:text-graphite focus:outline-none focus:ring-2 focus:ring-rust/10 focus:border-rust/30 transition-all"
          />
          <span className="text-graphite shrink-0">—</span>
          <input
            type="number"
            placeholder="最大面积"
            value={maxArea}
            onChange={(e) => setMaxArea(e.target.value)}
            className="w-full h-10 px-3 rounded-inputs border border-dove/30 bg-white text-sm text-ink placeholder:text-graphite focus:outline-none focus:ring-2 focus:ring-rust/10 focus:border-rust/30 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-4 pt-2">
        <button
          onClick={handleReset}
          className="text-[15px] font-medium text-graphite hover:text-ink hover:underline transition-colors"
        >
          重置
        </button>
        <button
          onClick={handleApply}
          className="rounded-full bg-ink text-white px-5 py-2.5 text-[15px] font-medium hover:bg-ink/90 transition-colors"
        >
          确认
        </button>
      </div>
    </div>
  );
}
