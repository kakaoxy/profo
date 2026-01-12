"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createConsultantAction, updateConsultantAction } from "../projects/actions";
import type { Consultant } from "../projects/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const formSchema = z.object({
  name: z.string().min(2, "姓名至少需要2个字符"),
  phone: z.string().min(11, "手机号至少需要11位"),
  avatar_url: z.string().optional(),
  role: z.enum(["admin", "consultant"]),
  status: z.enum(["active", "inactive"]),
});

interface ConsultantDialogProps {
  mode: "create" | "edit";
  initialData?: Consultant;
  trigger?: React.ReactNode;
}

export function ConsultantDialog({ mode, initialData, trigger }: ConsultantDialogProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name || "",
      phone: initialData?.phone || "",
      avatar_url: initialData?.avatar_url || "",
      role: (initialData?.role as "admin" | "consultant") || "consultant",
      status: ((initialData as (Consultant & { status?: string }))?.status as "active" | "inactive") || "active",
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      let result;
      if (mode === "create") {
        result = await createConsultantAction(values);
      } else if (initialData?.id) {
        result = await updateConsultantAction(initialData.id, values);
      }
      
      if (result?.success) {
        toast.success(mode === "create" ? "创建成功" : "更新成功");
        setOpen(false);
        form.reset();
        router.refresh();
      } else {
        toast.error(result?.error || "操作失败");
      }
    } catch (error) {
      console.error("Failed to save consultant:", error);
      toast.error("网络错误");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="mr-2 h-4 w-4" /> 添加置业顾问
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "添加置业顾问" : "编辑置业顾问"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input placeholder="顾问姓名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>电话</FormLabel>
                  <FormControl>
                    <Input placeholder="手机号码" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>角色</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择角色" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="admin">管理员</SelectItem>
                        <SelectItem value="consultant">置业顾问</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>状态</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择状态" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">正常</SelectItem>
                        <SelectItem value="inactive">禁用</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="avatar_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>头像 URL (可选)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full">
              保存
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
