"use client";

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PropertyFiltersAdvanced } from "./property-filters";

export function PropertyFilterSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs">更多筛选</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-[80vh] w-full p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b flex-row items-center justify-between">
          <div>
            <SheetTitle className="text-base">更多筛选</SheetTitle>
            <SheetDescription>价格、面积、商圈等高级筛选</SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-4">
          <PropertyFiltersAdvanced />
        </div>
      </SheetContent>
    </Sheet>
  );
}
