"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { Consultant } from "../projects/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConsultantDialog } from "./consultant-dialog";
import { getFileUrl } from "@/lib/config";

export const columns: ColumnDef<Consultant>[] = [
  {
    accessorKey: "avatar_url",
    header: "头像",
    cell: ({ row }) => {
      const avatar = row.getValue("avatar_url") as string;
      const name = row.getValue("name") as string;
      return (
        <Avatar>
          <AvatarImage src={getFileUrl(avatar)} alt={name} />
          <AvatarFallback>{name?.substring(0, 2)}</AvatarFallback>
        </Avatar>
      );
    },
  },
  {
    accessorKey: "name",
    header: "姓名",
  },
  {
    accessorKey: "phone",
    header: "电话",
  },
  {
    accessorKey: "role",
    header: "角色",
    cell: ({ row }) => {
      const role = row.getValue("role") as string;
      return (
        <Badge variant={role === "admin" ? "default" : "secondary"}>
          {role === "admin" ? "管理员" : "置业顾问"}
        </Badge>
      );
    },
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => {
      const status = (row.original as Consultant & { status?: string }).status;
      return (
        <Badge variant={status === "active" ? "outline" : "destructive"}>
          {status === "active" ? "正常" : "禁用"}
        </Badge>
      );
    },
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const consultant = row.original;
      return (
        <ConsultantDialog 
           mode="edit" 
           initialData={consultant} 
           trigger={<span className="text-blue-600 cursor-pointer text-sm hover:underline">编辑</span>} 
        />
      );
    },
  },
];
