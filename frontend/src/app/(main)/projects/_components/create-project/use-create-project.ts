"use client";

import { useState, useEffect, useCallback } from "react";
// 1. 引入 Resolver 类型，以便做精确的类型断言（比 as any 更安全）
import { useForm, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createProjectAction } from "../../actions";
import { formSchema, FormValues, DRAFT_KEY, ProjectCreateReq } from "./schema";

export const useCreateProject = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("basic");

  const form = useForm<FormValues>({
    // [关键修复] 使用类型断言
    // 告诉 TS：虽然 Schema 接受 string，但请把这个 Resolver 当作是只输出 FormValues 的 Resolver
    // 这解决了 2322 类型不兼容报错
    resolver: zodResolver(formSchema) as unknown as Resolver<FormValues>,
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
      // 数字和日期字段保持 undefined
      signing_price: undefined,
      area: undefined,
      signing_period: undefined,
      extensionPeriod: undefined,
      extensionRent: undefined,
      signing_date: undefined,
      planned_handover_date: undefined,
      // 附件列表
      attachments: [],
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

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset({ name: "" });
    toast.success("草稿已清空");
  }, [form]);

  // 提交逻辑
  // [修复]：因为 form 定义修复了，handleSubmit 这里的类型也会自动正确推断，解决了 2345 报错
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

        // Zod 已经把空字符串转为了 undefined，这里只需处理 undefined -> null
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

        // 附件数据存储到 signing_materials JSON 字段
        signing_materials: values.attachments?.length
          ? {
              attachments: values.attachments.map((att) => ({
                filename: att.filename,
                url: att.url,
                category: att.category,
                fileType: att.fileType,
                size: att.size,
              })),
            }
          : null,
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
