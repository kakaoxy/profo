import React from "react";
import { MiniProjectForm } from "../_components/mini-project-form";
import { getCurrentUserAction } from "@/app/(main)/admin/projects/actions/sales";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";

export default async function ProjectCreatePage() {
  const userResult = await getCurrentUserAction();
  const currentUser = userResult.success && userResult.data ? userResult.data.id : undefined;

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer>
        {/* Header Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div className="flex items-center gap-4">
            <Link href="/admin/marketing">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 rounded-full text-graphite hover:text-ink hover:bg-white hover:shadow-steep-sm"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <PageHeader title="创建新房源" description="填写房源基本信息以创建新的营销项目" />
          </div>
          <Link
            href="/admin/marketing"
            className="inline-flex items-center text-sm font-medium text-graphite hover:text-ink transition-colors"
          >
            取消
          </Link>
        </div>

        {/* Content */}
        <MiniProjectForm mode="create" defaultConsultantId={currentUser} />
      </PageContainer>
    </div>
  );
}
