import React from "react";
import { MiniProjectForm } from "../_components/mini-project-form";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProjectCreatePage() {
  return (
    <div className="min-h-screen bg-[#f8f9ff]">
      <div className="w-full max-w-[1400px] mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[#0b1c30] mb-2">
              创建新房源
            </h2>
            <p className="text-[#707785] text-sm flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
              填写房源基本信息以创建新的营销项目
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/minipro/projects"
              className="px-6 py-2.5 rounded-lg border border-[#c0c7d6]/50 text-[#0b1c30] font-medium hover:bg-[#e5eeff] transition-colors"
            >
              取消
            </Link>
          </div>
        </div>

        {/* Content */}
        <MiniProjectForm mode="create" />
      </div>
    </div>
  );
}
