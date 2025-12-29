import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getUsersAction, getRolesAction } from "./actions";
import { UsersClient } from "./_components/users-client";

export default async function UsersPage(props: {
  searchParams: Promise<{ page?: string; username?: string; role_id?: string; status?: string }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const username = searchParams.username || undefined;
  const role_id = searchParams.role_id || undefined;
  const status = searchParams.status || undefined;

  // Parallel fetch
  const [usersResult, rolesResult] = await Promise.all([
    getUsersAction({
      page,
      page_size: 20,
      username,
      role_id,
      status,
    }),
    getRolesAction({ page_size: 100 }) // Fetch all roles for selection
  ]);

  if (!usersResult.success || !usersResult.data) {
    console.error("获取用户数据失败:", usersResult.message);
    return <div className="p-4 text-red-500">获取用户数据失败: {usersResult.message}</div>;
  }

  if (!rolesResult.success || !rolesResult.data) {
    console.error("获取角色数据失败:", rolesResult.message);
    return <div className="p-4 text-red-500">获取角色数据失败: {rolesResult.message}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">用户管理</h2>
        <div className="flex items-center space-x-2">
        </div>
      </div>
      
      <Suspense fallback={<div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <UsersClient initialData={usersResult.data} roles={rolesResult.data.items} />
      </Suspense>
    </div>
  );
}
