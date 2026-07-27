"use client";

import { useState } from "react";
import { Loader2, KeyRound } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

import { useUserForm } from "./use-user-form";
import { ResetPasswordDialog } from "./reset-password-dialog";
import type { UserResponse, RoleResponse } from "../actions/index";
import { ROLE_CODES } from "@/lib/auth/permissions";
import { safeFormatDate } from "@/lib/formatters";

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserResponse | null;
  roles: RoleResponse[];
}

const SECTION_LABEL =
  "text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3";

export function UserDialog({ open, onOpenChange, user, roles }: UserDialogProps) {
  const { form, isPending, isEdit, onSubmit } = useUserForm({ user, open, onOpenChange, roles });
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  const selectedRoleIsCustomer =
    roles.find((r) => r.id === form.watch("role_id"))?.code === ROLE_CODES.CUSTOMER;
  // 编辑 C 端用户时主角色被锁定为 customer，主角色 Select 禁用
  const isEditingCustomer = isEdit && user?.role?.code === ROLE_CODES.CUSTOMER;
  const eyebrowText =
    selectedRoleIsCustomer || isEditingCustomer ? "C 端用户" : "内部用户";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-[560px] sm:w-[560px] overflow-y-auto p-0 gap-0"
        >
          <SheetHeader className="px-6 pt-6 pb-4 border-b">
            <div className="text-xs font-medium text-muted-foreground">
              {eyebrowText} · {isEdit ? "编辑" : "新建"}
            </div>
            <SheetTitle className="text-lg">
              {isEdit ? "编辑用户" : "新建用户"}
            </SheetTitle>
            <SheetDescription>
              {isEdit
                ? `用户ID: ${user?.id ?? "-"} · 提交线索: ${user?.leads_count ?? 0} 条`
                : "创建新用户并分配角色"}
            </SheetDescription>
          </SheetHeader>

          <Form {...form}>
            <form onSubmit={onSubmit}>
              <div className="px-6 py-4 space-y-6">
                {/* Section: 基本信息 */}
                <section>
                  <div className={SECTION_LABEL}>基本信息</div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>用户名</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="登录账号"
                              disabled={isEdit}
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nickname"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>昵称</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="显示名称"
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isEdit && (
                      <FormField
                        control={form.control}
                        name="password"
                        render={({ field }) => (
                          <FormItem className="col-span-2">
                            <FormLabel>密码</FormLabel>
                            <FormControl>
                              <Input
                                type="password"
                                placeholder="设置登录密码"
                                {...field}
                                value={field.value || ""}
                              />
                            </FormControl>
                            <FormDescription>
                              至少 8 位，包含大小写字母、数字和特殊字符
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>手机号</FormLabel>
                          <FormControl>
                            <Input placeholder="可选" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </section>

                {/* Section: 权限与身份 */}
                <section>
                  <div className={SECTION_LABEL}>权限与身份</div>
                  <div className="space-y-3">
                    <FormField
                      control={form.control}
                      name="role_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>主角色</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || ""}
                            disabled={isEditingCustomer}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="选择角色" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {roles.map((role) => (
                                <SelectItem key={role.id} value={role.id}>
                                  {role.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {isEditingCustomer && (
                            <FormDescription>C 端用户主角色不可更改</FormDescription>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {isEdit && (
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">账号状态</FormLabel>
                              <FormDescription>
                                {field.value === "active" ? "正常使用中" : "账号已禁用"}
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value === "active"}
                                onCheckedChange={(checked: boolean) =>
                                  field.onChange(checked ? "active" : "inactive")
                                }
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}

                    {!selectedRoleIsCustomer && (
                      <FormField
                        control={form.control}
                        name="enable_customer_identity"
                        render={({ field }) => (
                          <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                            <div className="space-y-0.5">
                              <FormLabel className="text-base">启用 C 端身份</FormLabel>
                              <FormDescription>
                                开启后该用户可同时登录 C 端平台
                              </FormDescription>
                            </div>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </section>

                {isEdit && (
                  <section>
                    <div className={SECTION_LABEL}>账号安全</div>
                    <div className="space-y-3">
                      <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                        <div>
                          最后登录：
                          <span className="tabular-nums text-foreground">
                            {safeFormatDate(user?.last_login_at, "yyyy-MM-dd HH:mm")}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px]">
                          修改密码或状态后，系统将立即失效该用户的所有现有 Token。
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setResetPasswordOpen(true)}
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        重置用户密码
                      </Button>
                    </div>
                  </section>
                )}
              </div>

              {/* Footer */}
              <div className="border-t px-6 py-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEdit ? "保存修改" : "创建用户"}
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <ResetPasswordDialog
        open={resetPasswordOpen}
        onOpenChange={setResetPasswordOpen}
        user={user ?? null}
      />
    </>
  );
}
