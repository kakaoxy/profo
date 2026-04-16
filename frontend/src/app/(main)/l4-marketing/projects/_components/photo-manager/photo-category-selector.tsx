"use client";

import { PhotoCategory, PHOTO_CATEGORY_CONFIG } from "../../types";
import { cn } from "@/lib/utils";
import { Camera, Paintbrush } from "lucide-react";

interface PhotoCategorySelectorProps {
  value: PhotoCategory;
  onChange: (category: PhotoCategory) => void;
  disabled?: boolean;
}

const categories: { value: PhotoCategory; icon: React.ReactNode }[] = [
  { value: "marketing", icon: <Camera className="h-4 w-4" /> },
  { value: "renovation", icon: <Paintbrush className="h-4 w-4" /> },
];

export function PhotoCategorySelector({
  value,
  onChange,
  disabled,
}: PhotoCategorySelectorProps) {
  return (
    <div className="flex gap-2">
      {categories.map((cat) => {
        const config = PHOTO_CATEGORY_CONFIG[cat.value];
        const isActive = value === cat.value;

        return (
          <button
            key={cat.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(cat.value)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all",
              isActive && "border-transparent text-white",
              !isActive && "bg-white hover:bg-gray-50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={
              isActive
                ? { backgroundColor: config.color }
                : { borderColor: "#e5e7eb" }
            }
          >
            {cat.icon}
            <span className="text-sm font-medium">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}
