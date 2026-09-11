import { Suspense } from "react";
import { Loader2 } from "lucide-react";

import { getOperationLogsAction } from "./actions/audit-log-actions";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
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
  const start_time = searchParams.start_time ? `${searchParams.start_time}T00:00:00` : undefined;
  const end_time = searchParams.end_time ? `${searchParams.end_time}T23:59:59` : undefined;

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
    return <div className="p-4 text-error">获取审计日志失败: {result.message}</div>;
  }

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="审计日志"
          description="记录后台关键操作，支持按用户、动作与资源类型追溯"
        />

        <Suspense
          fallback={
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }
        >
          <AuditLogsClient
            initialData={result.data}
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
