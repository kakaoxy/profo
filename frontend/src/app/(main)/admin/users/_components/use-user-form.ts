"use client";

import { logger } from "@/lib/logger";
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { createUserAction, updateUserAction } from "../actions/index";
import type { UserResponse, UserUpdate, UserCreate, RoleResponse } from "../actions/index";
import { passwordSchema } from "./password-schema";
import { ROLE_CODES } from "@/lib/auth/permissions";

const createSchema = z.object({
  username: z.string().min(3, "用户名至少3个字符").max(100),
  nickname: z.string().max(100).nullish(),
  password: passwordSchema,
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).nullish().or(z.literal("")),
  enable_customer_identity: z.boolean(),
});

const editSchema = z.object({
  username: z.string().optional(),
  password: z.string().optional(),
  nickname: z.string().max(100).nullish(),
  role_id: z.string().min(1, "请选择角色"),
  phone: z.string().max(20).nullish().or(z.literal("")),
  status: z.string().optional(),
  enable_customer_identity: z.boolean(),
});

const defaultFormValues = {
  username: "",
  nickname: "",
  password: "",
  role_id: "",
  phone: "",
  enable_customer_identity: false,
};

type FormValues = z.infer<typeof editSchema>;

interface UseUserFormProps {
  user?: UserResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: RoleResponse[];
}

export function useUserForm({ user, open, onOpenChange, roles }: UseUserFormProps) {
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
        status: user.status || "active",
        enable_customer_identity: !!(user.additional_roles?.some((r) => r.code === ROLE_CODES.CUSTOMER)),
      });
    } else {
      form.reset(defaultFormValues);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, open]);

  async function onSubmit(values: FormValues) {
    setIsPending(true);
    try {
      // 仅当主角色不是 customer 时，附加 customer 角色才有意义；
      // 主角色为 customer 时后端会拒绝附加，这里通过清空数组避免无效提交
      const customerId = roles.find((r) => r.code === ROLE_CODES.CUSTOMER)?.id;
      const mainRoleIsCustomer = roles.find((r) => r.id === values.role_id)?.code === ROLE_CODES.CUSTOMER;
      const additionalRoleIds =
        values.enable_customer_identity && customerId && !mainRoleIsCustomer ? [customerId] : [];

      let result;
      if (user) {
        const updateData: UserUpdate = {
          nickname: values.nickname || null,
          role_id: values.role_id,
          phone: values.phone || null,
          status: values.status,
          avatar: user.avatar,
          additional_role_ids: additionalRoleIds,
        };
        result = await updateUserAction(user.id, updateData);
      } else {
        const createData: UserCreate = {
          username: values.username!,
          password: values.password!,
          role_id: values.role_id,
          nickname: values.nickname || null,
          phone: values.phone || null,
          additional_role_ids: additionalRoleIds,
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
      logger.error(error);
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
