"use client";

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PropertyFilters } from "./property-filters";

export function PropertyFilterSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs">筛选</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle className="text-base">筛选条件</SheetTitle>
        </SheetHeader>
        <div className="p-4 overflow-y-auto h-[calc(100vh-60px)]">
          <PropertyFilters />
        </div>
      </SheetContent>
    </Sheet>
  );
}
