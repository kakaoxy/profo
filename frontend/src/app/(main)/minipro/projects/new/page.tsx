import React from "react";
import { MiniProjectForm } from "../_components/mini-project-form";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectCreatePage() {
  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" asChild className="shrink-0">
              <Link href="/minipro/projects">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <div className="text-sm text-slate-500">新建独立项目</div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                创建营销项目
              </h1>
            </div>
          </div>
        </div>

        {/* Content */}
        <MiniProjectForm mode="create" />
      </div>
    </div>
  );
}
