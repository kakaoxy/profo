"use client";

import { Button } from "@/components/ui/button";
import type { BrawlItem } from "../../../actions/monitor-lib/types";

interface CompetitorsCardProps {
  items: BrawlItem[];
}

export function CompetitorsCard({ items }: CompetitorsCardProps) {
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <div
          key={item.id}
          className={`p-4 ${item.is_current ? "bg-primary/5" : ""}`}
        >
          <div className="flex justify-between items-start mb-2">
            <div>
              <span className="text-sm font-bold text-foreground">
                {item.community}
              </span>
              <span
                className={`ml-2 text-[10px] font-bold ${item.status === "on_sale" ? "text-status-pending" : "text-status-selling"}`}
              >
                ●{" "}
                {item.display_status ||
                  (item.status === "on_sale" ? "在售" : "已成交")}
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground font-mono">
              {item.date}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <span>{item.layout}</span>
            <span className="text-border">|</span>
            <span>{item.floor}</span>
            <span className="text-border">|</span>
            <span>{item.area}㎡</span>
          </div>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-lg font-black text-destructive">
                ¥{item.total}万
              </span>
              <span className="ml-2 text-xs text-muted-foreground">
                ¥{item.unit.toLocaleString()}/㎡
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary"
            >
              详情
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
