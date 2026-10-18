"use client";

/**
 * 业务字典读取 Hook（运营可配枚举字典，公开只读端点）。
 *
 * 数据来源：`GET /api/v1/public/dicts/{dict_code}`（免登录，后端进程内缓存 60s）。
 * 默认 `labelOf` 对字典外值**原样返回**——宽松校验（spec D5）下存量自由文本渠道值
 * 不在字典中，必须能原样展示而不是显示空/未知。
 *
 * 与 `useDict` 同源的还有 `useRenovationStageLabel`（改造阶段展示别名，spec D4：
 * 只改展示名，不改入库中文值）。
 */

import { useCallback, useMemo } from "react";
import useSWR from "swr";

import type { components } from "@/lib/api-types";
import { publicFetcher } from "@/lib/swr";

/** 本期支持的字典组（与后端 SUPPORTED_DICTS 对齐） */
export type DictCode =
  "lead_attr_channel" | "recruit_source" | "document_template" | "renovation_stage_alias";

type PublicDictResponse = components["schemas"]["PublicDictListResponse"];
export type DictItem = components["schemas"]["PublicDictItemResponse"];

/** 后端公开端点缓存 60s，前端 dedupe 窗口与之对齐，避免同页多组件重复拉取 */
const DICT_DEDUPE_MS = 60_000;

export function useDict(code: DictCode) {
  const { data, isLoading } = useSWR<PublicDictResponse>(
    `/api/v1/public/dicts/${code}`,
    publicFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: DICT_DEDUPE_MS,
    },
  );

  const items = useMemo<DictItem[]>(() => data?.items ?? [], [data]);

  /** code → label；字典外值原样返回（unmanaged 兜底，绝不返回空串） */
  const labelOf = useCallback(
    (value: string | null | undefined): string => {
      if (!value) return "";
      return items.find((item) => item.code === value)?.label ?? value;
    },
    [items],
  );

  return { items, labelOf, isLoading };
}

/**
 * 改造阶段展示标签：字典 `renovation_stage_alias` 优先，字典缺失回退调用方默认值。
 *
 * 用途：项目详情/移动端的阶段名展示（spec D4 —— 仅展示层生效，
 * `projects.renovation_stage` 仍存中文入库值，历史单据不受影响）。
 *
 * @param fallbackLabel 字典未命中时的兜底文案（通常为本地 `RENOVATION_STAGES` 的 label）
 */
export function useRenovationStageLabel() {
  const { labelOf, isLoading } = useDict("renovation_stage_alias");
  const stageLabel = useCallback(
    (stage: string | null | undefined, fallbackLabel?: string): string => {
      if (!stage) return "";
      const resolved = labelOf(stage);
      // 字典缺该阶段（未种子/停用）时 labelOf 返回原值，此时用调用方默认文案
      if (resolved === stage && fallbackLabel) return fallbackLabel;
      return resolved;
    },
    [labelOf],
  );
  return { stageLabel, isLoading };
}
