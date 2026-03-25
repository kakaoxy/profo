"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { L4Consultant } from "../projects/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ConsultantDialog } from "./consultant-dialog";
import { getFileUrl } from "@/lib/config";

export const columns: ColumnDef<L4Consultant>[] = [
  {
    accessorKey: "avatar_url",
    header: "头像",
    cell: ({ row }) => {
      const avatar = row.getValue("avatar_url") as string;
      const name = row.getValue("name") as string;
      return (
        <Avatar>
          <AvatarImage src={avatar ? getFileUrl(avatar) : undefined} alt={name} />
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
    accessorKey: "is_active",
    header: "状态",
    cell: ({ row }) => {
      const isActive = row.getValue("is_active") as boolean;
      return (
        <Badge variant={isActive ? "outline" : "destructive"}>
          {isActive ? "在职" : "离职"}
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
