"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatAreaSqm,
  formatAvgPriceWan,
  formatCount,
  formatQoq,
  formatUnitPriceYuan,
} from "../../_lib/formatters";
import type { CommunityRow } from "../../_lib/types";

interface CommunityTableProps {
  items: CommunityRow[];
  total: number;
  /** 当前小区ID（UUID字符串），用于高亮当前行；可选，Level 3 详情页传入 */
  currentCommunityId?: string;
}

type SortKey = "sold_count" | "avg_price_wan" | "avg_unit_price" | "avg_area" | "price_qoq";

interface SortState {
  by: SortKey;
  order: "asc" | "desc";
}

const QOQ_COLOR: Record<string, string> = {
  up: "text-money-positive",
  down: "text-money-negative",
  flat: "text-muted-foreground",
  unknown: "text-muted-foreground",
};

function sortItems(items: CommunityRow[], sort: SortState): CommunityRow[] {
  const sorted = [...items].sort((a, b) => {
    const av = a[sort.by];
    const bv = b[sort.by];
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return sort.order === "asc" ? av - bv : bv - av;
  });
  return sorted;
}

export function CommunityTable({ items, total, currentCommunityId }: CommunityTableProps) {
  const router = useRouter();
  const [sort, setSort] = React.useState<SortState>({
    by: "sold_count",
    order: "desc",
  });

  const sortedItems = React.useMemo(() => sortItems(items, sort), [items, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.by === key
        ? { by: key, order: prev.order === "asc" ? "desc" : "asc" }
        : { by: key, order: "desc" },
    );
  };

  const navigateToDetail = (row: CommunityRow) => {
    router.push(`/admin/reports/communities/${row.community_id}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {currentCommunityId ? "同商圈小区列表" : "小区列表"}
          <Badge variant="secondary">{total}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>小区名称</TableHead>
                <SortableHead
                  label="成交套数"
                  sortKey="sold_count"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortableHead
                  label="均价(万)"
                  sortKey="avg_price_wan"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortableHead
                  label="单价(元/㎡)"
                  sortKey="avg_unit_price"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <TableHead>主力户型</TableHead>
                <TableHead>主力楼层</TableHead>
                <SortableHead
                  label="均面积(㎡)"
                  sortKey="avg_area"
                  sort={sort}
                  onToggle={toggleSort}
                />
                <SortableHead label="环比" sortKey="price_qoq" sort={sort} onToggle={toggleSort} />
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                    暂无小区数据
                  </TableCell>
                </TableRow>
              ) : (
                sortedItems.map((row) => {
                  const qoq = formatQoq(row.price_qoq);
                  const isCurrent = currentCommunityId && row.community_id === currentCommunityId;
                  return (
                    <TableRow
                      key={row.community_id}
                      onClick={() => navigateToDetail(row)}
                      className={
                        isCurrent
                          ? "bg-muted/50 cursor-pointer"
                          : "cursor-pointer hover:bg-muted/50"
                      }
                    >
                      <TableCell className="font-medium text-primary underline-offset-2 hover:underline">
                        {row.community_name}
                        {isCurrent && (
                          <span className="ml-2 text-xs text-muted-foreground">（当前）</span>
                        )}
                      </TableCell>
                      <TableCell>{formatCount(row.sold_count)}</TableCell>
                      <TableCell>{formatAvgPriceWan(row.avg_price_wan)}</TableCell>
                      <TableCell>{formatUnitPriceYuan(row.avg_unit_price)}</TableCell>
                      <TableCell>{row.main_layout ?? "-"}</TableCell>
                      <TableCell>{row.main_floor ?? "-"}</TableCell>
                      <TableCell>{formatAreaSqm(row.avg_area)}</TableCell>
                      <TableCell className={QOQ_COLOR[qoq.direction]}>{qoq.text}</TableCell>
                      <TableCell className="text-right">
                        {isCurrent ? (
                          <Button size="sm" variant="outline" disabled>
                            当前
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => navigateToDetail(row)}>
                            查看分析
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

interface SortableHeadProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onToggle: (key: SortKey) => void;
}

function SortableHead({ label, sortKey, sort, onToggle }: SortableHeadProps) {
  const isActive = sort.by === sortKey;
  const Icon = isActive ? (sort.order === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 h-8"
        onClick={() => onToggle(sortKey)}
      >
        <span>{label}</span>
        <Icon
          className={
            isActive ? "ml-1 h-3 w-3 text-primary" : "ml-1 h-3 w-3 text-muted-foreground/70"
          }
        />
      </Button>
    </TableHead>
  );
}
