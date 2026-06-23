"use client";

import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { createRoleAction, updateRoleAction } from "../../actions/index";
import type { RoleResponse } from "../../actions/index";

const formSchema = z.object({
  name: z.string().min(2, "名称至少2个字符").max(100, "名称不能超过100个字符"),
  code: z.string().min(2, "代码至少2个字符").max(50, "代码不能超过50个字符")
    .regex(/^[a-zA-Z0-9_]+$/, "代码只能包含字母、数字和下划线"),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
  is_active: z.boolean(),
});

const defaultFormValues = {
  name: "",
  code: "",
  description: "",
  permissions: [] as string[],
  is_active: true,
};

type FormValues = z.infer<typeof formSchema>;

interface UseRoleFormProps {
  role?: RoleResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function useRoleForm({ role, open, onOpenChange }: UseRoleFormProps) {
  const [isPending, setIsPending] = useState(false);
  const isEdit = !!role;

  const defaultValues = useMemo(() => defaultFormValues, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
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
      form.reset(defaultFormValues);
    }
  }, [role, form, open]);

  async function onSubmit(values: FormValues) {
    setIsPending(true);
    try {
      const result = isEdit
        ? await updateRoleAction(role.id, values)
        : await createRoleAction(values);

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
