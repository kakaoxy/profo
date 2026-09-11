import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getRolesAction } from "@/app/(main)/admin/users/actions/index";
import { RoleListResponse } from "@/app/(main)/admin/users/actions/role-actions";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { RolesClient } from "./_components/roles-client";

export default async function RolesPage(props: {
  searchParams: Promise<{ page?: string; name?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const name = searchParams.name || undefined;

  const result = await getRolesAction({
    page,
    page_size: 100, // Show more roles, usually not many
    name,
  });

  if (!result.success || !result.data) {
    return <div className="p-4 text-error">获取数据失败: {result.message}</div>;
  }

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="权限管理" description="配置角色及其菜单、操作权限范围" />

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <RolesClient initialData={result.data as RoleListResponse} />
        </Suspense>
      </PageContainer>
    </div>
  );
}
