import type { paths } from "@/lib/api-types";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { formatSnapshotTime } from "./_lib/todo-board-config";
import { TodoBoardView } from "./_components/todo-board-view";
import { TodoRulesConfigPopup } from "./_components/todo-rules-config-popup";

type TodoBoardResponse =
  paths["/api/v1/projects/todo-board"]["get"]["responses"][200]["content"]["application/json"];
type TodoBoardConfigResponse =
  paths["/api/v1/projects/todo-board/config"]["get"]["responses"][200]["content"]["application/json"];

/** 页头副文案（对齐设计稿 ARTBOARD 01-A） */
const PAGE_DESCRIPTION = "签约与装修阶段 · 一眼定位待处理事项 · 点待办看明细，点卡片进详情";

/**
 * 项目待办看板（RSC）：规则引擎实时计算签约+装修阶段项目待办，只读快照不落库。
 * 服务端首屏并行拉取看板 + 规则配置（配置失败降级为 null，弹窗内提示刷新），
 * 筛选/弹窗等交互下沉到 TodoBoardView / TodoRulesConfigPopup（客户端）。
 */
export default async function TodoBoardPage() {
  const client = await fetchClient();

  let data: TodoBoardResponse | null = null;
  let config: TodoBoardConfigResponse | null = null;
  try {
    // 无依赖请求并行（消除请求瀑布）；配置失败独立降级，不拖垮看板首屏
    const [boardRes, configRes] = await Promise.all([
      client.GET("/api/v1/projects/todo-board", {}),
      client.GET("/api/v1/projects/todo-board/config", {}).catch((e) => {
        if (isRedirectError(e)) throw e;
        logger.error("项目待办规则配置获取失败", e);
        return { data: null };
      }),
    ]);
    data = (boardRes.data as TodoBoardResponse | null) ?? null;
    config = (configRes.data as TodoBoardConfigResponse | null) ?? null;
  } catch (e) {
    // 401 场景 fetchClient 会抛 NEXT_REDIRECT 交由 Next.js 渲染层执行刷新重定向，
    // 必须放行（与 projects/page.tsx / layout.tsx 的处理一致）。
    if (isRedirectError(e)) throw e;
    logger.error("项目待办看板数据获取失败", e);
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-fog">
        <PageContainer className="flex flex-col gap-8">
          <PageHeader title="项目待办" description={PAGE_DESCRIPTION} />
          <div className="rounded-cards bg-white p-10 text-center shadow-steep">
            <p className="text-sm text-ash">数据加载失败，请刷新重试。</p>
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <div className="flex items-end justify-between gap-5">
          <PageHeader title="项目待办" description={PAGE_DESCRIPTION} />
          <div className="flex shrink-0 items-center gap-3 pb-[5px]">
            <TodoRulesConfigPopup config={config} />
            <div className="hidden text-xs whitespace-nowrap text-dove sm:block">
              规则快照{" "}
              <b className="font-[480] text-graphite">{formatSnapshotTime(data.generated_at)}</b>
            </div>
          </div>
        </div>
        <TodoBoardView data={data} />
      </PageContainer>
    </div>
  );
}
