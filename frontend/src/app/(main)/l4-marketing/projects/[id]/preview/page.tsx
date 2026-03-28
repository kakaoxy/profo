import React from "react";
import { fetchClient } from "@/lib/api-server";
import type { L4MarketingProject, L4MarketingMedia } from "../../types";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HeroGallery } from "./_components/hero-gallery";
import { PropertySpecs } from "./_components/property-specs";
import { PropertyInfo } from "./_components/property-info";
import { PriceSidebar } from "./_components/price-sidebar";

export const dynamic = "force-dynamic";

export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);

  if (isNaN(projectId)) {
    notFound();
  }

  const client = await fetchClient();

  // Fetch data in parallel
  const [projectRes, photosRes] = await Promise.all([
    client.GET("/api/v1/admin/l4-marketing/projects/{project_id}", {
      params: { path: { project_id: projectId } },
    }),
    client.GET("/api/v1/admin/l4-marketing/projects/{project_id}/media", {
      params: { path: { project_id: projectId }, query: { page: 1, size: 100 } },
    }),
  ]);

  if (projectRes.error || !projectRes.data) {
    notFound();
  }

  const project = projectRes.data as L4MarketingProject;
  const photos: L4MarketingMedia[] = photosRes.data?.items || [];

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
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#c0c7d6]/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/l4-marketing/projects/${project.id}/edit`}
            className="flex items-center gap-2 text-[#707785] hover:text-[#005daa] transition-colors font-medium"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            <span>返回编辑</span>
          </Link>
          <div className="h-4 w-px bg-[#c0c7d6]/30"></div>
          <span className="text-sm font-medium text-[#707785]">
            预览模式：{project.community_name || "未知小区"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-[#85fa51]/20 text-[#266d00] text-xs font-bold flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            {project.publish_status === "发布" ? "已发布" : "待发布"}
          </div>
          <Link
            href={`/l4-marketing/projects/${project.id}/edit`}
            className="bg-[#005daa] hover:bg-[#0075d5] text-white px-6 py-2 rounded-lg font-bold shadow-md transition-all active:scale-95"
          >
            立即发布
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
                <span className="text-[#707785] text-sm font-bold bg-[#eff4ff] px-3 py-1 rounded">
                  小区：{project.community_name || "未知小区"}
                </span>
              </div>
              <h1 className="text-4xl font-extrabold text-[#0b1c30] tracking-tight leading-tight">
                {project.title || "未命名房源"}
              </h1>
              {/* Tags - React 默认转义，XSS 风险已得到控制 */}
              {tags.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-3">
                  {tags.slice(0, 6).map((tag, index) => (
                    <span
                      key={index}
                      className="bg-[#85fa51]/20 text-[#266d00] border border-[#266d00]/10 px-3 py-1 rounded-full text-xs font-medium"
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
      <footer className="bg-[#eff4ff] border-t border-[#c0c7d6]/10 mt-12 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-lg font-bold text-[#707785] mb-4">
            Estate Logic
          </div>
          <p className="text-[#707785] text-sm max-w-md mx-auto">
            房源核心数据预览视图。仅供内部审核和责任人校对使用。
          </p>
        </div>
      </footer>
    </div>
  );
}
