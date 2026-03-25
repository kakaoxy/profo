import React from "react";
import { fetchClient } from "@/lib/api-server";
import type { L4MarketingProject, L4Consultant, L4MarketingMedia } from "../../types";
import { MiniProjectForm } from "../../_components/mini-project-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await fetchClient();

  // Fetch data in parallel
  const [projectRes, consultantsRes, photosRes] = await Promise.all([
    client.GET("/api/v1/admin/l4-marketing/projects/{project_id}", {
      params: { path: { project_id: id } },
    }),
    client.GET("/api/v1/admin/l4-marketing/consultants", {
      params: { query: { page: 1, size: 100 } },
    }),
    client.GET("/api/v1/admin/l4-marketing/projects/{project_id}/media", {
      params: { path: { project_id: id }, query: { page: 1, size: 100 } },
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
          <div className="text-sm font-semibold text-red-500">{message}</div>
          {statusCode ? (
            <div className="mt-2 text-xs text-slate-500">状态码: {statusCode}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const project = projectRes.data as L4MarketingProject;
  const consultants: L4Consultant[] = consultantsRes.data?.items || [];
  const photos: L4MarketingMedia[] = photosRes.data?.items || [];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" asChild className="shrink-0">
              <Link href={`/minipro/projects/${project.id}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="text-sm text-slate-500">编辑营销项目</div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                {project.title || "未命名项目"}
              </h1>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/minipro/projects/${project.id}`}>
              <Eye className="mr-2 h-4 w-4" />
              查看详情
            </Link>
          </Button>
        </div>

        {/* Content */}
        <MiniProjectForm
          mode="edit"
          consultants={consultants}
          initialProject={project}
          initialPhotos={photos}
        />
      </div>
    </div>
  );
}
