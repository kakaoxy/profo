import React from "react";
import { fetchClient } from "@/lib/api-server";
import { z } from "zod";
import type { L4MarketingProject, L4MarketingMedia } from "@/app/(main)/l4-marketing/projects/types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeroGallery } from "./_components/hero-gallery";
import { PropertySpecs } from "./_components/property-specs";
import { PropertyInfo } from "./_components/property-info";
import { PriceSidebar } from "./_components/price-sidebar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle } from "lucide-react";

export const dynamic = "force-dynamic";

// 路由参数验证 schema
const paramsSchema = z.object({
  id: z.string().min(1).regex(/^\d+$/, "ID 必须是数字"),
});

export default async function ProjectPreviewPage({
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
    notFound();
  }

  const project = projectRes.data as L4MarketingProject;
  // 为 API 返回的数据添加默认的 photo_category 字段
  const photos: L4MarketingMedia[] = (photosRes.data?.items || []).map((item: any) => ({
    ...item,
    photo_category: item.photo_category || "marketing",
  })) as L4MarketingMedia[];

  // Get images from project.images or photos
  const projectImages = project.images?.split(",").filter(Boolean) || [];
  const photoUrls =
    photos.length > 0
      ? photos.map((p) => p.file_path).filter((path): path is string => !!path)
      : projectImages;

  const mainImage = photoUrls[0] || "";
  const secondaryImages = photoUrls.slice(1, 3).filter((path): path is string => !!path);

  // Parse tags - 处理 null、undefined 和空字符串
  const tags = project.tags?.split(",").filter((tag) => tag.trim() !== "") || [];

  return (
    <div className="min-h-screen bg-slate-50/50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/l4-marketing/projects/${project.id}/edit`}>
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span>返回编辑</span>
            </Button>
          </Link>
          <div className="h-4 w-px bg-slate-200"></div>
          <span className="text-sm text-slate-500">
            预览模式：{project.community_name || "未知小区"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium flex items-center gap-1">
            <CheckCircle className="h-3 w-3" />
            {project.publish_status === "发布" ? "已发布" : "待发布"}
          </div>
          <Link href={`/l4-marketing/projects/${project.id}/edit`}>
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
              立即发布
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-20 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero: Images Preview */}
        <HeroGallery
          mainImage={mainImage}
          secondaryImages={secondaryImages}
          totalCount={photoUrls.length}
          projectStatus={project.project_status || "在途"}
        />

        {/* Content Grid */}
        <section className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
          <div className="lg:col-span-2 space-y-8">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-slate-500 text-sm font-medium bg-slate-100 px-3 py-1 rounded">
                  小区：{project.community_name || "未知小区"}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight leading-tight">
                {project.title || "未命名房源"}
              </h1>
              {/* Tags */}
              {tags.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {tags.slice(0, 6).map((tag, index) => (
                    <span
                      key={index}
                      className="bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-full text-xs font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Core Specs Bento Grid */}
            <PropertySpecs
              layout={project.layout}
              area={project.area}
              unitPrice={project.unit_price}
              orientation={project.orientation}
            />

            {/* Property Info Summary */}
            <PropertyInfo
              communityName={project.community_name || undefined}
              layout={project.layout}
              area={project.area}
              orientation={project.orientation}
              floorInfo={project.floor_info}
              decorationStyle={project.decoration_style || undefined}
              projectStatus={project.project_status}
              updatedAt={project.updated_at}
            />
          </div>

          {/* Sticky Sidebar */}
          <PriceSidebar
            projectId={project.id}
            totalPrice={project.total_price}
            unitPrice={project.unit_price}
            area={project.area}
          />
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-100 border-t border-slate-200 mt-12 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-lg font-bold text-slate-600 mb-4">
            Estate Logic
          </div>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            房源核心数据预览视图。仅供内部审核和责任人校对使用。
          </p>
        </div>
      </footer>
    </div>
  );
}
