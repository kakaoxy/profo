"use client"

import { ColumnDef } from "@tanstack/react-table"
import { components } from "@/lib/api-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, ImageIcon, MoreHorizontal } from "lucide-react"

export type Property = components["schemas"]["PropertyResponse"]

export const columns: ColumnDef<Property>[] = [
  {
    accessorKey: "id",
    header: "ID",
    cell: ({ row }) => <span className="text-xs text-muted-foreground">#{row.getValue("id")}</span>
  },
  {
    id: "image",
    header: "图",
    cell: () => (
      <div className="w-10 h-8 bg-slate-100 rounded border flex items-center justify-center text-slate-400">
        <ImageIcon className="h-4 w-4" />
      </div>
    )
  },
  {
    accessorKey: "community_name",
    header: "小区名称",
    cell: ({ row }) => <div className="font-medium">{row.getValue("community_name")}</div>
  },
  {
    accessorKey: "district",
    header: "区域",
    cell: ({ row }) => <span className="text-sm">{row.getValue("district") || "-"}</span>
  },
  {
    accessorKey: "layout_display",
    header: "户型",
  },
  {
    accessorKey: "floor_display",
    header: "楼层",
  },
  {
    accessorKey: "orientation",
    header: "朝向",
  },
  {
    accessorKey: "build_area",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        面积
        <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div>{row.getValue("build_area")} ㎡</div>,
  },
  {
    accessorKey: "total_price",
    header: ({ column }) => (
      <Button variant="ghost" size="sm" className="-ml-3" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
        总价
        <ArrowUpDown className="ml-2 h-3 w-3" />
      </Button>
    ),
    cell: ({ row }) => <div className="text-red-600 font-bold">{row.getValue("total_price")} 万</div>,
  },
  {
    accessorKey: "unit_price",
    header: "单价",
    cell: ({ row }) => <div className="text-xs text-muted-foreground">{row.getValue("unit_price")} </div>,
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const status = row.getValue("status") as string
      return <Badge variant={status === "在售" ? "default" : "secondary"}>{status}</Badge>
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => (
      <Button variant="outline" size="sm" onClick={() => alert(`查看详情 ID: ${row.original.id}`)}>
        查看
      </Button>
    ),
  },
]