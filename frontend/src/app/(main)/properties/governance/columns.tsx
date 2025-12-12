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
    header: "ID",
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
    header: "行政区",
  },
  {
    accessorKey: "business_circle",
    header: "商圈",
  },
  {
    accessorKey: "created_at",
    header: "创建时间",
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return date.toLocaleDateString("zh-CN");
    },
  },
];