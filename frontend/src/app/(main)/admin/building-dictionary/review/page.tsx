import { fetchClient } from "@/lib/api-server";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { ReviewClient } from "./review-client";

export const dynamic = "force-dynamic";

/**
 * 审核池页（FR-11 / Task 12.1）.
 *
 * 队列（提交时间倒序/状态/小区筛选/KPI）+ 三动作 resolve。
 */
export default async function ReviewPage() {
  const client = await fetchClient();
  const { data, error, response } = await client.GET("/api/v1/admin/building-dictionary/review", {
    params: { query: { page: 1, page_size: 20 } },
  });

  if (error || !data) {
    return (
      <PageContainer>
        <PageHeader title="审核池" description="录入端/机器链路新增小区·楼栋·户室的审核入口" />
        <div className="p-8 text-center text-error">
          {response?.status === 401 ? "登录状态已失效，请刷新页面重新登录" : "加载数据失败，请检查网络或权限。"}
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader title="审核池" description="录入端/机器链路新增小区·楼栋·户室的审核入口（处理人经 building_dict_reviewer_roles 配置）" />
      <ReviewClient initialData={data} />
    </PageContainer>
  );
}
