import { notFound } from "next/navigation";
import { z } from "zod";
import { fetchClient } from "@/lib/api-server";
import type {
  L4MarketingProject,
  L4MarketingMedia,
  PhotoCategory,
} from "@/app/(main)/admin/marketing/types";
import { MarketingDetailPage } from "../_components/marketing-detail-page";

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

/**
 * 营销房源详情页（独立页面，P0-1 页面化重构）.
 *
 * Server Component 并行拉取详情与媒体（消除请求瀑布），交给客户端
 * 双态容器（view/edit 切换 + isDirty 离开确认）渲染。
 */
export default async function MarketingProjectDetailPage({
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

  // 详情与媒体无依赖，并行拉取（消除请求瀑布）
  const [projectRes, photosRes] = await Promise.all([
    client.GET("/api/v1/admin/marketing/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/admin/marketing/projects/{project_id}/media", {
      params: { path: { project_id: projectId }, query: { page: 1, page_size: 100 } },
    }),
  ]);

  if (projectRes.error || !projectRes.data) {
    // 项目不存在/已删除 → 404（admin 内部页面无外部书签依赖）
    notFound();
  }

  const project = projectRes.data as L4MarketingProject;

  // 为 API 返回的数据添加默认的 photo_category 字段
  const apiItems = Array.isArray(photosRes.data?.items) ? photosRes.data.items : [];
  const photos: L4MarketingMedia[] = apiItems.map(mapToL4MarketingMedia);

  return <MarketingDetailPage initialProject={project} initialPhotos={photos} />;
}
