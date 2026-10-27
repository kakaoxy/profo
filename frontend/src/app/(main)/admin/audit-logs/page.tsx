import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { getOperationLogsAction } from "./actions/audit-log-actions";
import { getUsersSimpleAction } from "../users/actions/user-actions";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { AuditLogsClient } from "./_components/audit-logs-client";

/**
 * 审计日志页面（Server Component）。
 * 仅具备 operation_log:read 权限的用户可访问（PATH_PERMISSION_MAP 在 layout 层拦截）。
 * 操作人下拉数据来自 /users/simple（登录态即可访问），与日志列表并行请求，消除瀑布。
 */
export default async function AuditLogsPage(props: {
  searchParams: Promise<{
    page?: string;
    page_size?: string;
    user_id?: string;
    action?: string;
    resource_type?: string;
    start_time?: string;
    end_time?: string;
  }>;
}) {
  const searchParams = await props.searchParams;
  const page = Number(searchParams.page) || 1;
  const page_size = Number(searchParams.page_size) || 20;
  const user_id = searchParams.user_id || undefined;
  const action = searchParams.action || undefined;
  const resource_type = searchParams.resource_type || undefined;
  // 时间范围：input[type=date] 产生 yyyy-MM-dd，转为 ISO datetime 传给后端
  const start_time = searchParams.start_time ? `${searchParams.start_time}T00:00:00` : undefined;
  const end_time = searchParams.end_time ? `${searchParams.end_time}T23:59:59` : undefined;

  // 无依赖请求必须并行（AGENTS §2 消除请求瀑布）；人员列表失败不阻塞日志页，降级为空下拉
  const [logsResult, usersResult] = await Promise.all([
    getOperationLogsAction({ page, page_size, user_id, action, resource_type, start_time, end_time }),
    getUsersSimpleAction(),
  ]);

  if (!logsResult.success) {
    return <div className="p-4 text-error">获取审计日志失败: {logsResult.message}</div>;
  }

  // getUsersSimpleAction 无显式返回类型注解，data/nickname 需显式兜底（undefined → null）
  const operators =
    usersResult.success && usersResult.data
      ? usersResult.data.items.map((u) => ({
          id: u.id,
          nickname: u.nickname ?? null,
          username: u.username,
        }))
      : [];

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="审计日志"
          description="后台每一步操作都有记录：谁改的、改了什么、什么时候改的"
        />

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <AuditLogsClient
            initialData={logsResult.data}
            operators={operators}
            filters={{
              user_id,
              action,
              resource_type,
              start_time: searchParams.start_time,
              end_time: searchParams.end_time,
            }}
          />
        </Suspense>
      </PageContainer>
    </div>
  );
}
