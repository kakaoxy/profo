"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EditCommunityDialog } from "./edit-community-dialog";
import type { CommunityMinified } from "./pick-community-fields";

interface CreateColumnsOptions {
  onSuccess: () => void;
}

export function createColumns(options: CreateColumnsOptions): ColumnDef<CommunityMinified>[] {
  return [
    // 1. 多选框列
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: "id",
      header: () => <span className="inline">ID</span>,
      cell: ({ row }) => <span className="inline">{row.getValue("id")}</span>,
      size: 60,
    },
    {
      accessorKey: "name",
      header: "小区名称",
      cell: ({ row }) => <span className="font-medium">{row.getValue("name")}</span>,
    },
    {
      accessorKey: "total_properties",
      header: "关联房源数",
      cell: ({ row }) => <Badge variant="secondary">{row.getValue("total_properties")} 套</Badge>,
    },
    {
      accessorKey: "district",
      header: () => <span className="inline">行政区</span>,
      cell: ({ row }) => <span className="inline">{row.getValue("district")}</span>,
    },
    {
      accessorKey: "business_circle",
      header: () => <span className="inline">商圈</span>,
      cell: ({ row }) => <span className="inline">{row.getValue("business_circle")}</span>,
    },
    {
      accessorKey: "aliases",
      header: "关联别名",
      cell: ({ row }) => {
        const aliases = row.original.aliases;
        if (!aliases || aliases.length === 0) {
          return <span className="text-muted-foreground">-</span>;
        }
        const visible = aliases.slice(0, 3);
        const overflowCount = aliases.length - visible.length;
        return (
          <div className="flex flex-wrap items-center gap-1">
            {visible.map((alias) => (
              <Tooltip key={alias.id}>
                <TooltipTrigger asChild>
                  <span>
                    <Badge variant="secondary">{alias.alias_name}</Badge>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="space-y-0.5">
                    <div>别名：{alias.alias_name}</div>
                    <div>来源：{alias.data_source}</div>
                    <div>
                      创建时间：
                      {new Date(alias.created_at).toLocaleDateString("zh-CN")}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            ))}
            {overflowCount > 0 && <Badge variant="outline">+{overflowCount}</Badge>}
          </div>
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: "created_at",
      header: () => <span className="inline text-xs">创建时间</span>,
      cell: ({ row }) => {
        const date = new Date(row.getValue("created_at"));
        return <span className="inline text-xs">{date.toLocaleDateString("zh-CN")}</span>;
      },
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <EditCommunityDialog community={row.original} onSuccess={options.onSuccess} />
      ),
      enableSorting: false,
      enableHiding: false,
    },
  ];
}
