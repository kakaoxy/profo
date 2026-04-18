"use client";

import { useEffect, useCallback, useRef } from "react";
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
 * 防抖函数
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
    }, delay);
  };
}

/**
 * 处理草稿的 Hook
 * - 恢复草稿
 * - 保存草稿（带防抖）
 * - 清除草稿
 */
export function useDraft({ form, open, isEditMode }: UseDraftProps) {
  // 使用 ref 存储防抖函数，避免重复创建
  const saveDraftRef = useRef<ReturnType<typeof debounce> | null>(null);

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

  // 草稿保存（带 500ms 防抖）
  useEffect(() => {
    if (!open || isEditMode) return;

    // 创建防抖的保存函数
    saveDraftRef.current = debounce((value: unknown) => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(value));
      } catch (e) {
        console.error("Failed to save draft:", e);
      }
    }, 500);

    const subscription = form.watch((val) => {
      saveDraftRef.current?.(val);
    });

    return () => {
      subscription.unsubscribe();
      // 组件卸载时立即保存一次，确保数据不丢失
      if (saveDraftRef.current) {
        const currentValues = form.getValues();
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(currentValues));
        } catch (e) {
          console.error("Failed to save draft on cleanup:", e);
        }
      }
    };
  }, [open, form, isEditMode]);

  // 清除草稿
  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    form.reset({ community_name: "" });
    toast.success("草稿已清空");
  }, [form]);

  return { clearDraft };
}
