"use client";

import Link from "next/link";
import { logger } from "@/lib/logger";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  MoreHorizontal,
  SquarePen,
  Trash2,
  KeyRound,
  ChevronUp,
  ChevronDown,
  MessageCircle,
} from "lucide-react";
import { safeFormatDate } from "@/lib/formatters";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES, ROLE_CODES } from "@/lib/auth/permissions";

import { deleteUserAction } from "../actions/index";
import type { UserResponse } from "../actions/index";
import { USER_STATUS } from "../constants";

interface UserTableProps {
  data: UserResponse[];
  sort: { field: string; dir: "asc" | "desc" };
  onSort: (field: string) => void;
  onEdit: (user: UserResponse) => void;
  onResetPassword: (user: UserResponse) => void;
  onUnbindWechat: (user: UserResponse) => void;
}

// 主角色 code → .users-role-* 变体 class
const ROLE_BADGE_CLASS: Record<string, string> = {
  [ROLE_CODES.ADMIN]: "users-role-admin",
  [ROLE_CODES.OPERATOR]: "users-role-operator",
  [ROLE_CODES.USER]: "users-role-user",
  [ROLE_CODES.CUSTOMER]: "users-role-customer",
};

export function UserTable({
  data,
  sort,
  onSort,
  onEdit,
  onResetPassword,
  onUnbindWechat,
}: UserTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deletingId) return;

    setIsDeleting(true);
    try {
      const result = await deleteUserAction(deletingId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      logger.error(error);
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = USER_STATUS.find((s) => s.value === status);
    const label = statusConfig?.label || status;
    return (
      <span className={`users-status-badge users-status-${status}`}>
        <span className="dot" />
        {label}
      </span>
    );
  };

  // 可排序列头：仅当前激活列显示方向箭头
  const renderSortableHead = (label: string, field: string) => (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.field === field &&
          (sort.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </span>
    </TableHead>
  );

  return (
    <>
      <div className="rounded-md border overflow-x-auto scrollbar-hide">
        <Table>
          <TableHeader>
            <TableRow>
              {renderSortableHead("用户", "nickname")}
              {renderSortableHead("角色", "role")}
              {renderSortableHead("提交线索", "leads_count")}
              <TableHead>状态</TableHead>
              <TableHead>手机号</TableHead>
              {renderSortableHead("最后登录", "last_login_at")}
              <TableHead className="w-12.5"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((user) => {
              const roleBadgeClass =
                ROLE_BADGE_CLASS[user.role?.code] || "users-role-user";
              return (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar || ""} />
                        <AvatarFallback>
                          {user.nickname?.slice(0, 1) ||
                            user.username.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm">
                            {user.nickname || user.username}
                          </span>
                          {user.wechat_bound && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded border border-green-200 bg-green-50 px-1 py-0.5 text-[10px] text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400"
                              title="已绑定微信"
                            >
                              <MessageCircle className="h-2.5 w-2.5" />
                              微信
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {user.username}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`users-role-badge ${roleBadgeClass}`}>
                        <span className="dot" />
                        {user.role?.name || "未知角色"}
                      </span>
                      {user.additional_roles?.map((role) => (
                        <span
                          key={role.id}
                          className="ml-1 rounded border border-dashed border-border px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          +{role.name}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {user.leads_count > 0 ? (
                      <Link
                        href={`/admin/leads?creator_id=${user.id}`}
                        className="users-leads-link"
                      >
                        {user.leads_count}
                      </Link>
                    ) : (
                      <span className="users-leads-count zero">
                        {user.leads_count}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {user.phone || "-"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {safeFormatDate(user.last_login_at, "MM-dd HH:mm")}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <HasPermission code={PERMISSION_CODES.USER_UPDATE}>
                          <DropdownMenuItem onClick={() => onEdit(user)}>
                            <SquarePen className="mr-2 h-4 w-4" />
                            编辑用户
                          </DropdownMenuItem>
                        </HasPermission>
                        <HasPermission
                          code={PERMISSION_CODES.USER_RESET_PASSWORD}
                        >
                          <DropdownMenuItem
                            onClick={() => onResetPassword(user)}
                          >
                            <KeyRound className="mr-2 h-4 w-4" />
                            重置密码
                          </DropdownMenuItem>
                        </HasPermission>
                        <HasPermission code={PERMISSION_CODES.USER_UNBIND_WECHAT}>
                          {user.wechat_bound && (
                            <DropdownMenuItem
                              onClick={() => onUnbindWechat(user)}
                            >
                              <MessageCircle className="mr-2 h-4 w-4" />
                              解绑微信
                            </DropdownMenuItem>
                          )}
                        </HasPermission>
                        <HasPermission code={PERMISSION_CODES.USER_DELETE}>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeletingId(user.id)}
                            disabled={user.username === "admin"}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            删除用户
                          </DropdownMenuItem>
                        </HasPermission>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!deletingId}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除用户?</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。删除后用户将无法登录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "删除中..." : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
