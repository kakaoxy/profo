import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getRolesAction } from "@/app/(main)/users/actions";
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
    return <div className="p-4 text-red-500">获取数据失败: {result.message}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">权限管理</h2>
        <div className="flex items-center space-x-2">
        </div>
      </div>
      
      <Suspense fallback={<div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <RolesClient initialData={result.data} />
      </Suspense>
    </div>
  );
}
