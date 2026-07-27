import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getUsersAction, getRolesAction } from "./actions/index";
import { RoleListResponse } from "./actions/role-actions";
import { UsersClient } from "./_components/users-client";

export default async function UsersPage(props: {
  searchParams: Promise<{
    page?: string;
    username?: string;
    role_id?: string;
    status?: string;
    tab?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  // page 由前端客户端分页处理（slice currentItems），后端一次性拉取全量
  const username = searchParams.username || undefined;
  const role_id = searchParams.role_id || undefined;
  const status = searchParams.status || undefined;
  const sort = searchParams.sort || undefined;
  const dir = searchParams.dir || undefined;

  // Parallel fetch
  const [usersResult, rolesResult] = await Promise.all([
    getUsersAction({
      page: 1,
      page_size: 200, // 前端按 tab 客户端分割+统计+分页，需拉取全量（后端 max_page_size=200）
      username,
      role_id,
      status,
      sort,
      dir,
    }),
    getRolesAction({ page_size: 100 }) // Fetch all roles for selection
  ]);

  if (!usersResult.success || !usersResult.data) {
    return <div className="p-4 text-error">获取用户数据失败: {usersResult.message}</div>;
  }

  if (!rolesResult.success || !rolesResult.data) {
    return <div className="p-4 text-error">获取角色数据失败: {rolesResult.message}</div>;
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8 pt-6">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-1.5">
          <span>ADMIN</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground inline-block" />
          <span>USER MANAGEMENT</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">用户管理</h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理后台团队成员与 C 端客户账号，查看每位用户的线索提交活跃度
        </p>
      </div>
      
      <Suspense fallback={<div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
        <UsersClient initialData={usersResult.data} roles={(rolesResult.data as RoleListResponse).items} />
      </Suspense>
    </div>
  );
}
