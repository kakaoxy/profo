"use client";

import { useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import { getSalesUsersSimpleAction } from "../../../actions/sales";
import { getRenovationContractAction } from "../../../actions/renovation";
import type { RenovationContractMeta } from "../../../_components/project-detail/views/renovation/kpi";

/** 简单用户（与 actions/sales.ts 内部 UserSimple 结构一致：id/nickname/username） */
interface SimpleUser {
  id: string;
  nickname: string | null;
  username: string;
}

/** 页面级团队数据：用户 Map + 装修合同摘要（含对接负责人） */
export interface TeamMembersData {
  /** userId → 展示名（nickname ?? username），供右侧团队角色 ID 解析 */
  usersById: Map<string, string>;
  /** 装修合同摘要（公司/对接负责人/实际开工/预计完工）；未拉取到为 undefined */
  renovationMeta: RenovationContractMeta | undefined;
  loading: boolean;
}

/**
 * 页面级加载「用户列表 + 装修合同」（Promise.all 并行，消除请求瀑布）。
 *
 * 用途：
 * - 用户列表：右侧副列把渠道/讲房/谈判/对接负责人的角色 ID 解析为昵称（后端仅下发 ID）；
 * - 装修合同：签约阶段右侧也要展示「对接负责人」，但装修合同原本只在 RenovationView
 *   挂载时拉取（签约阶段不挂载），故上提至此，由 SideColumn 与 RenovationView 共用，
 *   避免双份请求。
 *
 * 注意：`GET /api/v1/users/simple` 默认取 100 条（上限 500），当前团队规模默认按 100 处理；
 * 若用户规模超出，需在此加分页拉全（见任务说明 §2.4 ⚠️ 6）。
 */
export function useTeamMembers(projectId: string | undefined): TeamMembersData {
  const [usersById, setUsersById] = useState<Map<string, string>>(new Map());
  const [renovationMeta, setRenovationMeta] = useState<RenovationContractMeta | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        // 用户列表 + 装修合同并行拉取（无依赖，禁止串行）
        const [usersRes, contractRes] = await Promise.all([
          getSalesUsersSimpleAction(),
          getRenovationContractAction(projectId),
        ]);
        if (cancelled) return;

        const map = new Map<string, string>();
        for (const user of (usersRes.data ?? []) as SimpleUser[]) {
          map.set(user.id, user.nickname || user.username || user.id);
        }
        setUsersById(map);

        if (contractRes.success && contractRes.data) {
          setRenovationMeta({
            companyName: contractRes.data.renovation_company ?? undefined,
            contactPersonId: contractRes.data.contact_person_id ?? undefined,
            actualStart: contractRes.data.actual_start_date ?? undefined,
            expectedEnd: contractRes.data.contract_end_date ?? undefined,
            actualEnd: contractRes.data.actual_end_date ?? undefined,
          });
        } else {
          setRenovationMeta(undefined);
        }
      } catch (error) {
        // action 内部均已 try/catch，此处防御未预期异常（如非 action 抛错）
        logger.error("加载页面团队数据异常", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { usersById, renovationMeta, loading };
}
