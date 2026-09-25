import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { PageContainer } from "@/app/(main)/admin/_components";

import { KeysPageView } from "./_components/keys-page-view";

type KeysDetailResponse = components["schemas"]["KeysDetailResponse"];
type KeyLogItem = components["schemas"]["KeyLogItem"];
type ProjectResponse = components["schemas"]["ProjectResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

/**
 * 钥匙管理独立页（Task 6）。
 *
 * Promise.all 并行请求三路：钥匙详情（主数据，失败 notFound()）、操作日志与项目概要
 * （次要数据，失败分别降级为空列表 / null）。不 try/catch 包裹，
 * NEXT_REDIRECT（401 自动刷新链）由 Next.js 渲染层自然放行。
 */
export default async function KeysPage({ params }: PageProps) {
  const { projectId } = await params;

  const client = await fetchClient();

  const [detailRes, logsRes, projectRes] = await Promise.all([
    client.GET("/api/v1/projects/{project_id}/keys", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/projects/{project_id}/keys/logs", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
  ]);

  // 主数据获取失败 → 404
  if (detailRes.error || !detailRes.data) {
    notFound();
  }

  const detail = extractApiData<KeysDetailResponse>(detailRes.data);
  if (!detail) {
    notFound();
  }

  // 操作日志（次要数据，失败降级为空列表；响应结构为 {items: [...]}）
  const logsData = logsRes.error ? null : extractApiData<{ items?: KeyLogItem[] }>(logsRes.data);
  const logs: KeyLogItem[] = logsData?.items ?? [];

  // 项目概要（仅页头副标题展示用，失败降级为 null）
  const project = projectRes.error
    ? null
    : (extractApiData<ProjectResponse>(projectRes.data) ?? null);

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        {/* 页头：返回链接 + 标题 + 项目名副标题（权限身份提示省略，不强造） */}
        <div className="flex flex-col gap-3">
          <Link
            href={`/admin/projects/${projectId}`}
            className="inline-flex w-fit items-center gap-1.5 rounded-sm text-sm font-medium text-graphite transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust focus-visible:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回项目详情
          </Link>
          <div>
            <h1 className="text-2xl font-[500] tracking-[-0.23px] text-ink">钥匙管理</h1>
            {project?.name && (
              <p className="mt-1 text-sm font-[430] text-graphite">{project.name}</p>
            )}
          </div>
        </div>

        <KeysPageView projectId={projectId} detail={detail} logs={logs} />
      </PageContainer>
    </div>
  );
}
