"use client";

import type { NeighborhoodRadarItem } from "../../../actions/monitor-lib/types";
import { getSpreadStyle, getSpreadIcon } from "./spread-utils";

interface RadarCardsProps {
  competitors: NeighborhoodRadarItem[];
}

export function RadarCards({ competitors }: RadarCardsProps) {
  return (
    <div className="sm:hidden divide-y divide-border">
      {competitors.map((item) => (
        <div
          key={item.community_id}
          className={`p-4 ${item.is_subject ? "bg-primary/5" : ""}`}
        >
          <div className="flex justify-between items-start mb-2">
            <span className="text-sm font-bold text-foreground">
              {item.community_name}
            </span>
            <span className={`text-xs font-bold ${getSpreadStyle(item)}`}>
              {getSpreadIcon(item)}
              {item.spread_label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground mb-0.5">挂牌</p>
              <p className="font-bold text-foreground">
                {item.listing_count} 套
              </p>
              <p className="text-primary font-bold">
                ¥{item.listing_avg_price.toLocaleString()}/㎡
              </p>
            </div>
            <div>
              <p className="text-muted-foreground mb-0.5">成交</p>
              <p className="font-bold text-foreground">
                {item.deal_count} 套
              </p>
              <p className="text-success font-bold">
                ¥{item.deal_avg_price.toLocaleString()}/㎡
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
