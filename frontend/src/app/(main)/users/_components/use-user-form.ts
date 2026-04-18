"use client";

import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { createUserAction, updateUserAction } from "../actions/index";
import type { UserResponse, UserUpdate, UserCreate } from "../actions/index";

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
});

const editSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  nickname: z.string().max(100).optional(),
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).optional().or(z.literal("")),
  status: z.string().optional(),
});

const defaultFormValues = {
  username: "",
  nickname: "",
  password: "",
  role_id: "",
  phone: "",
};

type FormValues = z.infer<typeof editSchema>;

interface UseUserFormProps {
  user?: UserResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function useUserForm({ user, open, onOpenChange }: UseUserFormProps) {
  const [isPending, setIsPending] = useState(false);
  const isEdit = !!user;

  const schema = isEdit ? editSchema : createSchema;
  const defaultValues = useMemo(() => defaultFormValues, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues,
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
      form.reset(defaultFormValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open]);

  async function onSubmit(values: FormValues) {
    setIsPending(true);
    try {
      let result;
      if (user) {
        const updateData: UserUpdate = {
          nickname: values.nickname || null,
          role_id: values.role_id,
          phone: values.phone || null,
          status: values.status,
          avatar: user.avatar,
        };
        result = await updateUserAction(user.id, updateData);
      } else {
        const createData: UserCreate = {
          username: values.username!,
          password: values.password!,
          role_id: values.role_id,
          nickname: values.nickname || null,
          phone: values.phone || null,
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

  return {
    form,
    isPending,
    isEdit,
    onSubmit: form.handleSubmit(onSubmit),
  };
}
