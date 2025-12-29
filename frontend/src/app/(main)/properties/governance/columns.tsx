"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { components } from "@/lib/api-types";

type Community = components["schemas"]["CommunityResponse"];

export const columns: ColumnDef<Community>[] = [
  // 1. 多选框列
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
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
    header: () => <span className="hidden sm:inline">ID</span>,
    cell: ({ row }) => <span className="hidden sm:inline">{row.getValue("id")}</span>,
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
    cell: ({ row }) => (
      <Badge variant="secondary">
        {row.getValue("total_properties")} 套
      </Badge>
    ),
  },
  {
    accessorKey: "district",
    header: () => <span className="hidden lg:inline">行政区</span>,
    cell: ({ row }) => <span className="hidden lg:inline">{row.getValue("district")}</span>,
  },
  {
    accessorKey: "business_circle",
    header: () => <span className="hidden lg:inline">商圈</span>,
    cell: ({ row }) => <span className="hidden lg:inline">{row.getValue("business_circle")}</span>,
  },
  {
    accessorKey: "created_at",
    header: () => <span className="hidden sm:inline text-xs">创建时间</span>,
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return <span className="hidden sm:inline text-xs">{date.toLocaleDateString("zh-CN")}</span>;
    },
  },
];