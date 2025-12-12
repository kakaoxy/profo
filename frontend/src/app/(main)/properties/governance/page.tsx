import { fetchClient } from "@/lib/api-server";
import { GovernanceView } from "./governance-view";

// 强制动态渲染，确保每次进来数据都是新的
export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const client = await fetchClient();
  
  // 获取所有小区数据（为了方便治理，我们可能希望一次性拉取较多数据，或者分页）
  // 这里假设我们先拉取前 500 条用于治理，或者你可以实现完整的服务端分页
  const { data, error } = await client.GET("/api/admin/communities", {
    params: {
      query: {
        page: 1,
        page_size: 200, // 拉取足够多的数据供治理
      },
    },
  });

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-500">
        加载数据失败，请检查网络或权限。
      </div>
    );
  }

  return (
    <div className="container h-full flex flex-col gap-6 py-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">数据治理</h1>
        <p className="text-muted-foreground">
          合并重复的小区名称，清洗脏数据。合并操作将迁移关联的房源数据，操作不可撤销。
        </p>
      </div>

      {/* 核心治理视图 */}
      <GovernanceView data={data.items || []} total={data.total} />
    </div>
  );
}