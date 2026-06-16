import React from "react";
import { fetchClient } from "@/lib/api-server";
import { z } from "zod";
import { notFound } from "next/navigation";
import type { L4MarketingProject, L4MarketingMedia, PhotoCategory } from "@/app/(main)/l4-marketing/projects/types";
import { MiniProjectForm } from "../../_components/mini-project-form";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeParseDate } from "@/lib/validators";

// 路由参数验证 schema
const paramsSchema = z.object({
  id: z.string().min(1).regex(/^\d+$/, "ID 必须是数字"),
});

// 类型守卫：验证是否为有效的照片类别
function isPhotoCategory(value: unknown): value is PhotoCategory {
  return value === "marketing" || value === "renovation";
}

// 将 API 媒体项转换为 L4MarketingMedia
function mapToL4MarketingMedia(item: unknown): L4MarketingMedia {
  if (!item || typeof item !== "object") {
    return {
      id: 0,
      marketing_project_id: 0,
      file_url: "",
      media_type: "image",
      photo_category: "marketing",
      sort_order: 0,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  const apiItem = item as Record<string, unknown>;
  return {
    ...apiItem,
    id: typeof apiItem.id === "number" || typeof apiItem.id === "string" ? apiItem.id : 0,
    file_url: typeof apiItem.file_url === "string" ? apiItem.file_url : "",
    photo_category: isPhotoCategory(apiItem.photo_category) ? apiItem.photo_category : "marketing",
  } as L4MarketingMedia;
}

// 从响应中提取错误状态码
function extractStatusCode(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }
  return undefined;
}

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 验证路由参数
  const parsed = paramsSchema.safeParse({ id });
  if (!parsed.success) {
    notFound();
  }

  const projectId = Number(parsed.data.id);

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
    const statusCode = extractStatusCode(projectRes.error);
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问该项目（请重新登录或联系管理员开通权限）"
        : "获取项目详情失败，请稍后重试";
    return (
      <div className="min-h-screen bg-muted/50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-sm font-semibold text-error">{message}</div>
          {statusCode ? (
            <div className="mt-2 text-xs text-muted-foreground">状态码: {statusCode}</div>
          ) : null}
        </div>
      </div>
    );
  }

  const project = projectRes.data as L4MarketingProject;

  // 为 API 返回的数据添加默认的 photo_category 字段
  const apiItems = Array.isArray(photosRes.data?.items) ? photosRes.data.items : [];
  const photos: L4MarketingMedia[] = apiItems
    .map(mapToL4MarketingMedia);

  return (
    <div className="min-h-screen bg-muted/50">
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
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                编辑房源信息
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                最后更新于 {safeParseDate(project.updated_at)?.toLocaleString('zh-CN') ?? '未知时间'}
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
