"use client";

import { logger } from "@/lib/logger";
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
 * 防抖函数返回类型
 * 包含主函数和取消方法
 */
interface DebouncedFunction<T extends (...args: unknown[]) => void> {
  (...args: Parameters<T>): void;
  cancel: () => void;
}

/**
 * 防抖函数
 * @param fn 要执行的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖函数和取消方法
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debouncedFn = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };

  // 添加取消方法，用于清理待执行的定时器
  debouncedFn.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFn;
}

/**
 * 处理草稿的 Hook
 * - 恢复草稿
 * - 保存草稿（带防抖）
 * - 清除草稿
 */
export function useDraft({ form, open, isEditMode }: UseDraftProps) {
  // 使用 ref 存储防抖函数，避免重复创建
  const saveDraftRef = useRef<DebouncedFunction<(value: unknown) => void> | null>(null);

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
          if (parsed.commission_start_date) {
            parsed.commission_start_date = fromDateStr(parsed.commission_start_date);
          }
          if (parsed.commission_end_date) {
            parsed.commission_end_date = fromDateStr(parsed.commission_end_date);
          }
          // 兼容旧 draft：若缺少 owners 但存在历史单业主字段，映射为 owners[0]
          if ((!parsed.owners || !Array.isArray(parsed.owners)) && (parsed.owner_name || parsed.owner_phone || parsed.owner_id_card)) {
            parsed.owners = [
              {
                owner_name: parsed.owner_name || "",
                owner_phone: parsed.owner_phone || "",
                owner_id_card: parsed.owner_id_card || "",
                bank_name: "",
                bank_card_number: "",
                relation_type: "业主",
                owner_info: "",
              },
            ];
          }
          delete parsed.owner_name;
          delete parsed.owner_phone;
          delete parsed.owner_id_card;
          form.reset(parsed);
          toast.info("已恢复上次未保存的草稿");
        } catch (e) {
          logger.error("Draft parse error", e);
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
        logger.error("Failed to save draft:", e);
      }
    }, 500);

    const subscription = form.watch((val) => {
      saveDraftRef.current?.(val);
    });

    return () => {
      subscription.unsubscribe();
      // 取消待执行的防抖定时器，防止内存泄漏
      saveDraftRef.current?.cancel();
      // 立即保存当前值，确保数据不丢失
      const currentValues = form.getValues();
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(currentValues));
      } catch (e) {
        logger.error("Failed to save draft on cleanup:", e);
      }
    };
  }, [open, form, isEditMode]);

  // 清除草稿
  const clearDraft = useCallback(() => {
    // 取消待执行的保存操作
    saveDraftRef.current?.cancel();
    localStorage.removeItem(DRAFT_KEY);
    // 重置所有字段为初始值
    form.reset({
      community_name: "",
      address: "",
      area: undefined,
      business_form: "",
      district: "",
      business_circle: "",
      rooms: undefined,
      halls: undefined,
      bathrooms: undefined,
      orientation: "南北",
      electricity_account: undefined,
      water_account: undefined,
      gas_account: undefined,
      owners: [
        {
          owner_name: "",
          owner_phone: "",
          owner_id_card: "",
          bank_name: "",
          bank_card_number: "",
          relation_type: "业主",
          owner_info: "",
        },
      ],
      notes: "",
      contract_no: "",
      signing_price: undefined,
      signing_date: undefined,
      signing_period: undefined,
      extension_period: undefined,
      extension_rent: undefined,
      cost_assumption_type: "meifangbao",
      cost_assumption_other: "",
      planned_handover_date: undefined,
      commission_start_date: undefined,
      commission_end_date: undefined,
      other_agreements: "",
      attachments: [],
    });
    toast.success("草稿已清空");
  }, [form]);

  return { clearDraft };
}
