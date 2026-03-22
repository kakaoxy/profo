"use client";

import { useEffect, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { FormValues, DRAFT_KEY } from "./schema";
import { fromDateStr } from "./utils";

interface UseDraftProps {
  form: UseFormReturn<FormValues>;
  open: boolean;
  isEditMode: boolean;
}

/**
 * 处理草稿的 Hook
 * - 恢复草稿
 * - 保存草稿
 * - 清除草稿
 */
export function useDraft({ form, open, isEditMode }: UseDraftProps) {
  // 草稿恢复
  useEffect(() => {
    if (open && !isEditMode) {
      const draft = localStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          if (parsed.signing_date) {
            parsed.signing_date = fromDateStr(parsed.signing_date);
          }
          if (parsed.planned_handover_date) {
            parsed.planned_handover_date = fromDateStr(
              parsed.planned_handover_date
            );
          }
          form.reset(parsed);
          toast.info("已恢复上次未保存的草稿");
        } catch (e) {
          console.error("Draft parse error", e);
        }
      }
    }
  }, [open, form, isEditMode]);

  // 草稿保存
  useEffect(() => {
    if (!open || isEditMode) return;
    const subscription = form.watch((val) => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(val));
    });
    return () => subscription.unsubscribe();
  }, [open, form, isEditMode]);

  // 清除草稿
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset({ community_name: "" });
    toast.success("草稿已清空");
  }, [form]);

  return { clearDraft };
}
