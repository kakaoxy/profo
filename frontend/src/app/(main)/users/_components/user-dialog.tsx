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

import { createUserAction, updateUserAction } from "../actions";
import type { UserResponse, RoleResponse, UserUpdate, UserCreate } from "../actions";

// Create Schema
const createSchema = z.object({
  username: z.string().min(3, "用户名至少3个字符").max(100),
  nickname: z.string().max(100).optional(),
  password: z.string()
    .min(8, "密码至少8个字符")
    .regex(/[A-Z]/, "密码必须包含至少一个大写字母")
    .regex(/[a-z]/, "密码必须包含至少一个小写字母")
    .regex(/\d/, "密码必须包含至少一个数字")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "密码必须包含至少一个特殊字符"),
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).optional().or(z.literal("")),
  status: z.string().optional(),
});

// Edit Schema
const editSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  nickname: z.string().max(100).optional(),
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).optional().or(z.literal("")),
  status: z.string().optional(),
});

interface UserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserResponse | null;
  roles: RoleResponse[];
}

export function UserDialog({ open, onOpenChange, user, roles }: UserDialogProps) {
  const [isPending, setIsPending] = useState(false);

  // Determine which schema to use
  const schema = user ? editSchema : createSchema;
  
  // Use looser type for form to accommodate both schemas
  const form = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: "",
      nickname: "",
      password: "",
      role_id: "",
      phone: "",
      status: "active",
    },
  });

  useEffect(() => {
    if (user) {
      form.reset({
        username: user.username,
        nickname: user.nickname || "",
        role_id: user.role_id,
        phone: user.phone || "",
        status: user.status,
      });
    } else {
      form.reset({
        username: "",
        nickname: "",
        password: "",
        role_id: "",
        phone: "",
        status: "active",
      });
    }
  }, [user, form, open]);

  async function onSubmit(values: z.infer<typeof editSchema>) {
    setIsPending(true);
    try {
      let result;
      if (user) {
        // Prepare update data
        const updateData: UserUpdate = {
          nickname: values.nickname || null,
          role_id: values.role_id,
          phone: values.phone || null,
          status: values.status,
          avatar: user.avatar, // Keep existing avatar
        };
        result = await updateUserAction(user.id, updateData);
      } else {
        // Create mode
        const createData: UserCreate = {
           username: values.username!, // Validated by createSchema
           password: values.password!, // Validated by createSchema
           role_id: values.role_id,
           nickname: values.nickname || null,
           phone: values.phone || null,
           // status not supported in UserCreate, defaults to active on backend
        };
        result = await createUserAction(createData);
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
          <DialogTitle>{user ? "编辑用户" : "新建用户"}</DialogTitle>
          <DialogDescription>
            {user ? "修改用户信息" : "创建新用户并分配角色"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!user && (
              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>用户名</FormLabel>
                    <FormControl>
                      <Input placeholder="登录账号" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {!user && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>密码</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="设置登录密码" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormDescription>至少8位，包含大小写字母、数字和特殊字符</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="nickname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>昵称</FormLabel>
                  <FormControl>
                    <Input placeholder="显示名称" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ''}>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>手机号</FormLabel>
                  <FormControl>
                    <Input placeholder="可选" {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {user && (
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
