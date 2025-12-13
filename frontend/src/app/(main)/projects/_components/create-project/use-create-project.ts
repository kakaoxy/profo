"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createProjectAction } from "../../actions";
import { formSchema, FormValues, DRAFT_KEY, ProjectCreateReq } from "./schema";

export const useCreateProject = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  // 初始化 Form
  // 此时 FormValues 中的数字字段严格为 number | undefined
  // 并且 Zod Resolver 也会输出严格的 number | undefined
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      community_name: "",
      address: "",
      manager: "",
      tags: "",
      owner_name: "",
      owner_phone: "",
      owner_id_card: "",
      costAssumption: "",
      otherAgreements: "",
      notes: "",
      remarks: "",
      // 数字和日期保持 undefined
      signing_price: undefined,
      area: undefined,
      signing_period: undefined,
      extensionPeriod: undefined,
      extensionRent: undefined,
      signing_date: undefined,
      planned_handover_date: undefined,
    },
  });

  // 草稿恢复
  useEffect(() => {
    if (open) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.signing_date)
            parsed.signing_date = new Date(parsed.signing_date);
          if (parsed.planned_handover_date)
            parsed.planned_handover_date = new Date(
              parsed.planned_handover_date
            );
          form.reset(parsed);
          toast.info("已恢复上次未保存的草稿");
        } catch (e) {
          console.error("Draft parse error", e);
        }
      }
    }
  }, [open, form]);

  // 草稿保存
  useEffect(() => {
    if (!open) return;
    const subscription = form.watch((val) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(val));
    });
    return () => subscription.unsubscribe();
  }, [open, form]);

  // 清空草稿
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset({ name: "" });
    toast.success("草稿已清空");
  }, [form]);

  // 提交逻辑
  const onSubmit = async (values: FormValues) => {
    setLoading(true);

    try {
      const tagArray = values.tags
        ? values.tags
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : null;

      const payload: ProjectCreateReq = {
        name: values.name,
        community_name: values.community_name || null,
        address: values.address || null,
        manager: values.manager || null,
        tags: tagArray,

        // 转换 undefined 为 null
        signing_price: values.signing_price ?? null,
        area: values.area ?? null,
        signing_period: values.signing_period ?? null,
        extensionPeriod: values.extensionPeriod ?? null,
        extensionRent: values.extensionRent ?? null,

        owner_name: values.owner_name || null,
        owner_phone: values.owner_phone || null,
        owner_id_card: values.owner_id_card || null,
        costAssumption: values.costAssumption || null,
        otherAgreements: values.otherAgreements || null,
        notes: values.notes || null,
        remarks: values.remarks || null,

        signing_date: values.signing_date?.toISOString() || null,
        planned_handover_date:
          values.planned_handover_date?.toISOString() || null,

        signing_materials: null,
        owner_info: null,
      };

      const res = await createProjectAction(payload);

      if (res.success) {
        toast.success("项目创建成功");
        localStorage.removeItem(DRAFT_KEY);
        setOpen(false);
        form.reset();
        setActiveTab("basic");
      } else {
        toast.error(res.message || "创建失败");
      }
    } catch (error) {
      toast.error("网络请求错误");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    open,
    setOpen,
    loading,
    activeTab,
    setActiveTab,
    clearDraft,
    onSubmit: form.handleSubmit(onSubmit),
  };
};
