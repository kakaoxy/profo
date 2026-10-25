import { cache } from "react";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";

import { BdOverviewHeaderActions } from "./overview-header-actions";
import type { BdKpiResponse } from "./types";

/**
 * 字典 KPI hero（FR-01）与页头待审核徽标——独立于列表的 Server Component。
 *
 * 性能（慢查询报告 2026-10-25 §6.1.2）：本组件是 KPI 的唯一数据入口，
 * 由 page.tsx 放进 `<Suspense>`，使 `/kpi` 的等待不再阻塞列表与筛选渲染。
 * 原实现与列表同处一个 `Promise.all`，`/kpi` 慢 6~9s 就整页慢。
 *
 * 去重：page.tsx 有两个 Suspense 边界（页头 actions 与 hero 各一个），
 * 用 React `cache` 包裹 fetcher，同一次请求内只发一次 `/kpi`。
 *
 * 失败降级（fail soft）：KPI 是展示数字，接口失败时不拖垮整页——hero 显示「—」，
 * 页头徽标按 0 渲染（待审核入口本身仍可点击）。
 */

const getKpi = cache(async (): Promise<BdKpiResponse | null> => {
  const client = await fetchClient();
  const res = await client.GET("/api/v1/admin/building-dictionary/kpi", {});
  // 先取值再判断：openapi-fetch 的联合类型在 `if (res.error)` 分支内会收窄为 never，
  // 分支里再读 res.response/res.error 会报 TS2339（同项目 leads/[leadId] 解构写法同理）
  const status: number | undefined = res.response?.status;
  const failure = res.error;
  if (failure || !res.data) {
    logger.error("楼盘字典 KPI 加载失败:", { status, error: failure });
    return null;
  }
  return res.data;
});

/** KPI 卡片定义（设计稿：唯一 Apricot 暖卡 + 灰底卡） */
function kpiCards(kpi: BdKpiResponse) {
  return [
    { label: "小区", value: kpi.community_count, sub: "全量 19,655 · 覆盖 16 区", warm: true },
    { label: "楼栋", value: kpi.building_count, sub: "全量 526,670 · 97% 带坐标", warm: false },
    { label: "户室", value: kpi.room_count, sub: "全量 7,332,314", warm: false },
    { label: "已绑项目", value: kpi.linked_project_count, sub: "已选到具体户室的项目", warm: false },
  ];
}

interface BdKpiHeroProps {
  /**
   * 渲染区段：
   * - ``hero``：KPI 四卡（Suspense 内容）
   * - ``skeleton``：四卡骨架（Suspense fallback，保持等高避免布局抖动）
   * - ``actions``：页头动作区（含待审核徽标计数）
   */
  section: "hero" | "skeleton" | "actions";
}

export async function BdKpiHero({ section }: BdKpiHeroProps) {
  if (section === "skeleton") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-busy="true" aria-label="KPI 统计加载中">
        {["小区", "楼栋", "户室", "已绑项目"].map((label, i) => (
          <div
            key={label}
            className={`rounded-[20px] px-[18px] pb-3.5 pt-4 ${i === 0 ? "bg-apricot-wash" : "bg-fog"}`}
          >
            <p className={`text-[12px] ${i === 0 ? "text-rust" : "text-graphite"}`}>{label}</p>
            <p className="mt-1 font-display text-[30px] leading-none tracking-[-0.01em] text-ink/30 tabular-nums">
              —
            </p>
            <p className="mt-1 text-[10.5px] text-transparent select-none">占位</p>
          </div>
        ))}
      </div>
    );
  }

  const kpi = await getKpi();

  if (section === "actions") {
    return <BdOverviewHeaderActions pendingCount={kpi?.pending_count ?? 0} />;
  }

  if (!kpi) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="status">
        {["小区", "楼栋", "户室", "已绑项目"].map((label, i) => (
          <div
            key={label}
            className={`rounded-[20px] px-[18px] pb-3.5 pt-4 ${i === 0 ? "bg-apricot-wash" : "bg-fog"}`}
          >
            <p className={`text-[12px] ${i === 0 ? "text-rust" : "text-graphite"}`}>{label}</p>
            <p className="mt-1 font-display text-[30px] leading-none tracking-[-0.01em] text-ink/30 tabular-nums">
              —
            </p>
            <p className="mt-1 text-[10.5px] text-graphite">统计暂不可用</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpiCards(kpi).map((k) => (
        <div
          key={k.label}
          className={`rounded-[20px] px-[18px] pb-3.5 pt-4 ${k.warm ? "bg-apricot-wash" : "bg-fog"}`}
        >
          <p className={`text-[12px] ${k.warm ? "text-rust" : "text-graphite"}`}>{k.label}</p>
          <p className="mt-1 font-display text-[30px] leading-none tracking-[-0.01em] text-ink tabular-nums">
            {k.value.toLocaleString()}
          </p>
          <p className="mt-1 text-[10.5px] text-graphite">{k.sub}</p>
        </div>
      ))}
    </div>
  );
}
