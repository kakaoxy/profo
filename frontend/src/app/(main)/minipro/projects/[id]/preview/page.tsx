import React from "react";
import { fetchClient } from "@/lib/api-server";
import type { L4MarketingProject, L4MarketingMedia } from "../../types";
import Link from "next/link";
import { getFileUrl } from "@/lib/config";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

// 价格格式化
const formatPrice = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return "--";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "--";
  return `${numValue.toLocaleString()}`;
};

// 单价格式化
const formatUnitPrice = (value: string | number | undefined | null, area: string | number | undefined | null) => {
  if (value === undefined || value === null || area === undefined || area === null) return "--";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "--";
  return `${numValue.toLocaleString()}`;
};

// 面积格式化
const formatArea = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return "--";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "--";
  return `${numValue.toLocaleString()}`;
};

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
  const photoUrls = photos.length > 0 
    ? photos.map(p => p.file_path) 
    : projectImages;

  const mainImage = photoUrls[0];
  const secondaryImages = photoUrls.slice(1, 3);

  // Parse tags
  const tags = project.tags?.split(",").filter(Boolean) || [];

  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#c0c7d6]/20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href={`/minipro/projects/${project.id}/edit`}
            className="flex items-center gap-2 text-[#707785] hover:text-[#005daa] transition-colors font-medium"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            <span>返回编辑</span>
          </Link>
          <div className="h-4 w-px bg-[#c0c7d6]/30"></div>
          <span className="text-sm font-medium text-[#707785]">预览模式：{project.community_name || "未知小区"}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 rounded-full bg-[#85fa51]/20 text-[#266d00] text-xs font-bold flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            {project.publish_status === "发布" ? "已发布" : "待发布"}
          </div>
          <Link
            href={`/minipro/projects/${project.id}/edit`}
            className="bg-[#005daa] hover:bg-[#0075d5] text-white px-6 py-2 rounded-lg font-bold shadow-md transition-all active:scale-95"
          >
            立即发布
          </Link>
        </div>
      </nav>

      <main className="pt-20 pb-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Hero: Images Preview */}
        <section className="mt-4 grid grid-cols-12 gap-4 h-[500px]">
          <div className="col-span-12 lg:col-span-8 relative overflow-hidden rounded-2xl group">
            {mainImage ? (
              <img
                src={getFileUrl(mainImage)}
                alt="Primary view"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#005daa]/10 to-[#0075d5]/10 flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#005daa" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-30"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              </div>
            )}
            <div className="absolute top-4 left-4">
              <span className="bg-[#9d6a00] text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg">
                {project.project_status === "在售" ? "在售中" : project.project_status === "已售" ? "已成交" : "在途中"}
              </span>
            </div>
          </div>
          <div className="col-span-12 lg:col-span-4 grid grid-rows-2 gap-4">
            {secondaryImages[0] ? (
              <div className="relative overflow-hidden rounded-2xl group">
                <img
                  src={getFileUrl(secondaryImages[0])}
                  alt="Interior"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#eff4ff] to-[#dce9ff]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#707785" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-30"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </div>
              </div>
            )}
            {secondaryImages[1] ? (
              <div className="relative overflow-hidden rounded-2xl group">
                <img
                  src={getFileUrl(secondaryImages[1])}
                  alt="Kitchen"
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                {photoUrls.length > 3 && (
                  <button className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-[#005daa] px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-white transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                    查看全部 {photoUrls.length} 张照片
                  </button>
                )}
              </div>
            ) : (
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#eff4ff] to-[#dce9ff]">
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#707785" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="opacity-30"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                </div>
              </div>
            )}
          </div>
        </section>

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
              {/* Tags */}
              {tags.length > 0 && (
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
              )}
            </div>

            {/* Core Specs Bento Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0.5 rounded-2xl overflow-hidden bg-[#c0c7d6]/10 border border-[#c0c7d6]/10">
              <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">户型</span>
                <span className="text-lg font-bold text-[#0b1c30]">{project.layout || "--"}</span>
              </div>
              <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">面积</span>
                <span className="text-lg font-bold text-[#0b1c30]">{formatArea(project.area)}㎡</span>
              </div>
              <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">单价</span>
                  <span className="text-[8px] bg-[#005daa]/10 text-[#005daa] px-1 rounded">自动计算</span>
                </div>
                <span className="text-lg font-bold text-[#0b1c30]">{formatUnitPrice(project.unit_price, project.area)}万/㎡</span>
              </div>
              <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
                <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">朝向</span>
                <span className="text-lg font-bold text-[#0b1c30]">{project.orientation || "--"}</span>
              </div>
            </div>

            {/* Property Info Summary */}
            <div className="space-y-6 pt-4">
              <h3 className="text-xl font-bold text-[#0b1c30] border-l-4 border-[#005daa] pl-4">房源信息摘要</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 p-8 bg-white rounded-2xl border border-[#c0c7d6]/10">
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">小区</span>
                  <span className="text-[#0b1c30] font-semibold">{project.community_name || "--"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">户型</span>
                  <span className="text-[#0b1c30] font-semibold">{project.layout || "--"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">面积</span>
                  <span className="text-[#0b1c30] font-semibold">{formatArea(project.area)}㎡</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">朝向</span>
                  <span className="text-[#0b1c30] font-semibold">{project.orientation || "--"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">楼层</span>
                  <span className="text-[#0b1c30] font-semibold">{project.floor_info || "--"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">装修风格</span>
                  <span className="text-[#0b1c30] font-semibold">{project.decoration_style || "--"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">项目状态</span>
                  <span className="text-[#0b1c30] font-semibold">{project.project_status || "--"}</span>
                </div>
                <div className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2">
                  <span className="text-[#707785] text-sm font-medium">更新时间</span>
                  <span className="text-[#0b1c30] font-semibold text-xs">
                    {project.updated_at ? new Date(project.updated_at).toLocaleString('zh-CN') : "--"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Sidebar */}
          <div className="lg:sticky lg:top-28 space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-[#c0c7d6]/10 shadow-sm">
              <div className="flex flex-col gap-1 mb-6">
                <span className="text-[#707785] text-sm font-medium">房源总价</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-[#005daa] tracking-tight">
                    {formatPrice(project.total_price)}
                  </span>
                  <span className="text-lg font-bold text-[#005daa]">万</span>
                </div>
                <div className="mt-1 text-sm font-medium text-[#707785]">
                  单价：{formatUnitPrice(project.unit_price, project.area)} 元/㎡
                </div>
              </div>

              {/* Responsible Person */}
              <div className="mt-8 pt-8 border-t border-[#c0c7d6]/10 flex flex-col gap-4">
                <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">房源责任人</span>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-[#d3e4fe] flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#005daa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div>
                    <div className="text-[#0b1c30] font-bold">管理员</div>
                    <div className="text-[#707785] text-xs">房源审核员</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mt-8">
                <Link
                  href={`/minipro/projects/${project.id}/edit`}
                  className="w-full bg-[#005daa] hover:bg-[#0075d5] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  修改信息
                </Link>
              </div>
            </div>

            {/* Quick Context */}
            <div className="bg-[#005daa]/5 p-6 rounded-3xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#005daa]/10 rounded-lg text-[#005daa]">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
                </div>
                <div>
                  <div className="text-xs text-[#707785]">提示</div>
                  <div className="text-sm font-bold text-[#0b1c30]">预览模式仅显示核心字段</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-[#eff4ff] border-t border-[#c0c7d6]/10 mt-12 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="text-lg font-bold text-[#707785] mb-4">Estate Logic</div>
          <p className="text-[#707785] text-sm max-w-md mx-auto">
            房源核心数据预览视图。仅供内部审核和责任人校对使用。
          </p>
        </div>
      </footer>
    </div>
  );
}
