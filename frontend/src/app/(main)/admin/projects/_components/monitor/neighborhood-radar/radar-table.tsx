"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { NeighborhoodRadarItem } from "../../../actions/monitor-lib/types";
import { getSpreadStyle, getSpreadIcon } from "./spread-utils";

interface RadarTableProps {
  competitors: NeighborhoodRadarItem[];
}

export function RadarTable({ competitors }: RadarTableProps) {
  return (
    <div className="hidden sm:block overflow-x-auto scrollbar-hide">
      <Table className="min-w-[800px]">
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent border-b border-border">
            <TableHead className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              小区名称
            </TableHead>
            <TableHead className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              挂牌套数 (渠道)
            </TableHead>
            <TableHead className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              挂牌均价
            </TableHead>
            <TableHead className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              成交套数 (渠道)
            </TableHead>
            <TableHead className="py-3 px-4 text-[10px] font-bold text-muted-foreground uppercase tracking-wider text-right">
              成交均价
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border">
          {competitors.map((item) => (
            <TableRow
              key={item.community_id}
              className={`${item.is_subject ? "bg-primary/5" : "hover:bg-muted"} transition-colors border-none`}
            >
              <TableCell className="py-4 px-4">
                <span className="text-sm font-bold text-foreground">
                  {item.community_name}
                </span>
              </TableCell>
              <TableCell className="py-4 px-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">
                    {item.listing_count} 套
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    贝壳:{item.listing_beike} | 我爱:
                    {item.listing_iaij}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-4 px-4">
                <span className="text-sm font-bold text-primary">
                  ¥ {item.listing_avg_price.toLocaleString()} /㎡
                </span>
              </TableCell>
              <TableCell className="py-4 px-4">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-foreground">
                    {item.deal_count} 套
                  </span>
                  <span className="text-[10px] text-muted-foreground font-medium">
                    贝壳:{item.deal_beike} | 我爱:{item.deal_iaij}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-4 px-4 text-right">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold text-success">
                    ¥ {item.deal_avg_price.toLocaleString()} /㎡
                  </span>
                  <span
                    className={`text-[10px] font-bold mt-0.5 ${getSpreadStyle(item)}`}
                  >
                    {getSpreadIcon(item)}
                    {item.spread_label}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
