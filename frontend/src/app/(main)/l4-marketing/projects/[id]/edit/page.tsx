import React from "react";
import { fetchClient } from "@/lib/api-server";
import type { L4MarketingProject, L4MarketingMedia } from "../../types";
import { MiniProjectForm } from "../../_components/mini-project-form";
import Link from "next/link";
import { ArrowLeft, Eye, CloudDownload } from "lucide-react";

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
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-[#ba1a1a]">无效的项目ID</div>
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
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-[#ba1a1a]">{message}</div>
          {statusCode ? (
            <div className="mt-2 text-xs text-[#707785]">状态码: {statusCode}</div>
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
    <div className="min-h-screen bg-[#f8f9ff]">
      <div className="w-full max-w-[1400px] mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#0b1c30] mb-2">
              编辑房源信息
            </h2>
            <p className="text-[#707785] text-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
              最后更新于 {project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : '未知时间'}
            </p>
          </div>
          <div className="flex gap-3">
            <button className="px-6 py-2.5 rounded-lg border border-[#c0c7d6]/50 text-[#0b1c30] font-medium hover:bg-[#e5eeff] transition-colors flex items-center gap-2">
              <CloudDownload className="h-4 w-4" />
              从项目导入
            </button>
            <Link
              href="/l4-marketing/projects"
              className="px-6 py-2.5 rounded-lg border border-[#c0c7d6]/50 text-[#0b1c30] font-medium hover:bg-[#e5eeff] transition-colors"
            >
              取消
            </Link>
            <Link
              href={`/l4-marketing/projects/${project.id}/preview`}
              className="px-6 py-2.5 rounded-lg bg-[#e5eeff] text-[#005daa] font-medium hover:bg-[#dce9ff] transition-colors"
            >
              预览
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
