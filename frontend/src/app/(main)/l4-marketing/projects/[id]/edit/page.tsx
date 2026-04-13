import React from "react";
import { fetchClient } from "@/lib/api-server";
import type { L4MarketingProject, L4MarketingMedia } from "../../types";
import { MiniProjectForm } from "../../_components/mini-project-form";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);

  if (isNaN(projectId)) {
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-red-600">无效的项目ID</div>
        </div>
      </div>
    );
  }

  const client = await fetchClient();

  // Fetch data in parallel
  const [projectRes, photosRes] = await Promise.all([
    client.GET("/api/v1/admin/l4-marketing/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/admin/l4-marketing/projects/{project_id}/media", {
      params: { path: { project_id: projectId }, query: { page: 1, page_size: 100 } },
    }),
  ]);

  if (projectRes.error || !projectRes.data) {
    const statusCode =
      typeof projectRes.error === "object" &&
      projectRes.error &&
      "status" in projectRes.error
        ? Number((projectRes.error as { status?: unknown }).status)
        : undefined;
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问该项目（请重新登录或联系管理员开通权限）"
        : "获取项目详情失败，请稍后重试";
    return (
      <div className="min-h-screen bg-slate-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-red-600">{message}</div>
          {statusCode ? (
            <div className="mt-2 text-xs text-slate-500">状态码: {statusCode}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const project = projectRes.data as L4MarketingProject;
  // 为 API 返回的数据添加默认的 photo_category 字段
  const photos: L4MarketingMedia[] = (photosRes.data?.items || []).map((item: any) => ({
    ...item,
    photo_category: item.photo_category || "marketing",
  })) as L4MarketingMedia[];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1400px] mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <Link href="/l4-marketing/projects">
              <Button variant="outline" size="icon" className="h-10 w-10">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                编辑房源信息
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                最后更新于 {project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '未知时间'}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/l4-marketing/projects">
              <Button variant="outline">
                取消
              </Button>
            </Link>
            <Link href={`/l4-marketing/projects/${project.id}/preview`}>
              <Button variant="outline">
                <Eye className="mr-2 h-4 w-4" />
                预览
              </Button>
            </Link>
          </div>
        </div>

        {/* Content */}
        <MiniProjectForm
          mode="edit"
          initialProject={project}
          initialPhotos={photos}
        />
      </div>
    </div>
  );
}
