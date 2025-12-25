"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

import { createRoleAction, updateRoleAction } from "@/app/(main)/users/actions";
import { PERMISSIONS } from "@/app/(main)/users/constants";
import type { RoleResponse } from "@/app/(main)/users/actions";

const formSchema = z.object({
  name: z.string().min(2, "名称至少2个字符").max(100, "名称不能超过100个字符"),
  code: z.string().min(2, "代码至少2个字符").max(50, "代码不能超过50个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "代码只能包含字母、数字和下划线"),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  is_active: z.boolean(),
});

type RoleFormValues = z.infer<typeof formSchema>;

interface RoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleResponse | null;
}

export function RoleDialog({ open, onOpenChange, role }: RoleDialogProps) {
  const [isPending, setIsPending] = useState(false);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      permissions: [],
      is_active: true,
    },
  });

  useEffect(() => {
    if (role) {
      form.reset({
        name: role.name,
        code: role.code,
        description: role.description || "",
        permissions: role.permissions || [],
        is_active: role.is_active,
      });
    } else {
      form.reset({
        name: "",
        code: "",
        description: "",
        permissions: [],
        is_active: true,
      });
    }
  }, [role, form, open]);

  async function onSubmit(values: RoleFormValues) {
    setIsPending(true);
    try {
      let result;
      if (role) {
        result = await updateRoleAction(role.id, values);
      } else {
        result = await createRoleAction(values);
      }

      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error(error);
      toast.error("操作失败");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{role ? "编辑角色" : "新建角色"}</DialogTitle>
          <DialogDescription>
            {role ? "修改现有角色信息及权限配置" : "创建一个新角色并分配权限"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：财务专员" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色代码</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：finance_staff" {...field} disabled={!!role} />
                  </FormControl>
                  <FormDescription>角色唯一标识，创建后不可修改</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述</FormLabel>
                  <FormControl>
                    <Textarea placeholder="描述角色的职责和权限范围" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permissions"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">权限配置</FormLabel>
                    <FormDescription>
                      选择该角色拥有的系统权限
                    </FormDescription>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {PERMISSIONS.map((item) => (
                      <FormField
                        key={item.value}
                        control={form.control}
                        name="permissions"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={item.value}
                              className="flex flex-row items-start space-x-3 space-y-0"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(item.value)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([...(field.value || []), item.value])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== item.value
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="font-normal text-sm">
                                {item.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">启用状态</FormLabel>
                    <FormDescription>
                      禁用后该角色的用户将无法登录或操作
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
