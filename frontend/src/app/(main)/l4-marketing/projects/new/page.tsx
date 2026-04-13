import React from "react";
import { MiniProjectForm } from "../_components/mini-project-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectCreatePage() {
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
                创建新房源
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                填写房源基本信息以创建新的营销项目
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/l4-marketing/projects">
              <Button variant="outline">
                取消
              </Button>
            </Link>
          </div>
        </div>

        {/* Content */}
        <MiniProjectForm mode="create" />
      </div>
    </div>
  );
}
