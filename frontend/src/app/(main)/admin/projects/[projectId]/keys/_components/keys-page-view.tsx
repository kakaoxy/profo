"use client";

import { useCallback, useState } from "react";

import { client } from "@/lib/api-client";
import { extractApiData } from "@/lib/api-helpers";

import { LogsCard } from "./logs-card";
import { ManagerKeyCard } from "./manager-key-card";
import { NormalKeysCard } from "./normal-keys-card";
import type { KeyLogItem, KeysDetailResponse } from "./constants";

interface KeysPageViewProps {
  projectId: string;
  detail: KeysDetailResponse;
  logs: KeyLogItem[];
}

/**
 * 钥匙管理页客户端外壳（Task 6）：管理密码 / 普通密码 / 操作日志三卡（垂直 flex gap）。
 *
 * detail 由服务端首屏注入；mutation 成功后优先用响应里返回的最新 KeysDetailResponse
 * 就地更新（applyDetail），批量删除等不返回 detail 的操作走 refreshDetail 重拉。
 */
export function KeysPageView({ projectId, detail: initialDetail, logs }: KeysPageViewProps) {
  const [detail, setDetail] = useState(initialDetail);

  /** mutation 响应携带最新 detail → 就地替换 */
  const applyDetail = useCallback((next: KeysDetailResponse) => {
    setDetail(next);
  }, []);

  /** 批量删除不返回 detail → 重新 GET 详情（失败静默，卡片保留旧数据） */
  const refreshDetail = useCallback(async () => {
    try {
      const { data, error } = await client.GET("/api/v1/projects/{project_id}/keys", {
        params: { path: { project_id: projectId } },
      });
      if (!error && data) {
        setDetail(extractApiData<KeysDetailResponse>(data));
      }
    } catch (error) {
      console.error("刷新钥匙详情失败:", error);
    }
  }, [projectId]);

  return (
    <div className="flex flex-col gap-5">
      <ManagerKeyCard
        projectId={projectId}
        managerKey={detail.manager_key}
        onDetail={applyDetail}
      />
      <NormalKeysCard
        projectId={projectId}
        normalKeys={detail.normal_keys}
        onDetail={applyDetail}
        onRefresh={refreshDetail}
      />
      <LogsCard logs={logs} normalKeys={detail.normal_keys} />
    </div>
  );
}
