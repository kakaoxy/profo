import { Suspense } from "react";
import { Loader2, ScrollText } from "lucide-react";

import { getOperationLogsAction } from "./actions/audit-log-actions";
import { AuditLogsClient } from "./_components/audit-logs-client";

/**
 * 审计日志页面（Server Component）。
 * 仅具备 operation_log:read 权限的用户可访问（PATH_PERMISSION_MAP 在 layout 层拦截）。
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
  const start_time = searchParams.start_time
    ? `${searchParams.start_time}T00:00:00`
    : undefined;
  const end_time = searchParams.end_time
    ? `${searchParams.end_time}T23:59:59`
    : undefined;

  const result = await getOperationLogsAction({
    page,
    page_size,
    user_id,
    action,
    resource_type,
    start_time,
    end_time,
  });

  if (!result.success) {
    return (
      <div className="p-4 text-error">获取审计日志失败: {result.message}</div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-bold tracking-tight">
          <ScrollText className="h-7 w-7" />
          审计日志
        </h1>
      </div>

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }
      >
        <AuditLogsClient
          initialData={result.data}
          filters={{ user_id, action, resource_type, start_time: searchParams.start_time, end_time: searchParams.end_time }}
        />
      </Suspense>
    </div>
  );
}
