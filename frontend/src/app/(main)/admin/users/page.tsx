import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { getUsersAction, getRolesAction } from "./actions/index";
import { RoleListResponse } from "./actions/role-actions";
import { UserListResponse } from "./actions/user-actions";
import { UsersClient } from "./_components/users-client";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";

// 后端列表单页上限 200（settings.max_page_size）。本页在客户端按 tab 分割+统计+分页，
// 需要「满足筛选条件的全量用户」：只拉第 1 页时，用户量超过 200 后最新 200 名之外的行
// 会被静默丢弃，创建较早的内部账号从列表消失（搜索仍能命中，因过滤发生在 LIMIT 之前）。
const USERS_PAGE_SIZE = 200;

/**
 * 拉取满足筛选条件的全量用户（按后端单页上限分页补齐）.
 *
 * 先取第 1 页拿到 total，再并行补齐其余页，避免串行请求瀑布。
 */
async function getAllUsers(filters: {
  username?: string;
  role_id?: string;
  status?: string;
  sort?: string;
  dir?: string;
}): Promise<{ success: true; data: UserListResponse } | { success: false; message: string }> {
  const first = await getUsersAction({ ...filters, page: 1, page_size: USERS_PAGE_SIZE });
  if (!first.success) {
    return { success: false, message: first.message ?? "获取用户列表失败" };
  }
  if (!first.data) {
    return { success: false, message: "获取用户列表失败" };
  }
  const total = first.data.total ?? first.data.items.length;
  const pageCount = Math.ceil(total / USERS_PAGE_SIZE);
  if (pageCount <= 1) {
    return { success: true, data: { ...first.data, total, page: 1, page_size: USERS_PAGE_SIZE } };
  }
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      getUsersAction({ ...filters, page: index + 2, page_size: USERS_PAGE_SIZE }),
    ),
  );
  const items = [...first.data.items];
  for (const result of rest) {
    if (!result.success) {
      return { success: false, message: result.message ?? "获取用户列表失败" };
    }
    if (!result.data) {
      return { success: false, message: "获取用户列表失败" };
    }
    items.push(...result.data.items);
  }
  return {
    success: true,
    data: { ...first.data, items, total, page: 1, page_size: USERS_PAGE_SIZE },
  };
}

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
  // page 由前端客户端分页处理（slice currentItems），后端拉取全量（分页补齐，见 getAllUsers）
  const username = searchParams.username || undefined;
  const role_id = searchParams.role_id || undefined;
  // status === "all" 表示显式查看全部（含已删除）→ 传 undefined 不加过滤
  // status 缺省时默认传 "active" 隐藏已删除用户（与 /users/simple 端点语义一致）
  const status = searchParams.status === "all" ? undefined : searchParams.status || "active";
  const sort = searchParams.sort || undefined;
  const dir = searchParams.dir || undefined;

  // Parallel fetch
  const [usersResult, rolesResult] = await Promise.all([
    getAllUsers({ username, role_id, status, sort, dir }),
    getRolesAction({ page_size: 100 }), // Fetch all roles for selection
  ]);

  if (!usersResult.success) {
    return <div className="p-4 text-error">获取用户数据失败: {usersResult.message}</div>;
  }

  if (!rolesResult.success || !rolesResult.data) {
    return <div className="p-4 text-error">获取角色数据失败: {rolesResult.message}</div>;
  }

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="用户管理"
          description="管理后台团队成员与 C 端客户账号，查看每位用户的线索提交活跃度"
        />

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <UsersClient
            initialData={usersResult.data}
            roles={(rolesResult.data as RoleListResponse).items}
          />
        </Suspense>
      </PageContainer>
    </div>
  );
}
