import React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { MiniProjectForm } from "../_components/mini-project-form";
import { getCurrentUserAction } from "@/app/(main)/admin/projects/actions/sales";
import { PageContainer } from "@/app/(main)/admin/_components";

export default async function ProjectCreatePage() {
  const userResult = await getCurrentUserAction();
  const currentUser = userResult.success && userResult.data ? userResult.data.id : undefined;

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6 pb-28">
        <header className="pt-2">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/admin/marketing"
              className="inline-flex items-center gap-1.5 text-[11px] text-graphite transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回营销列表
            </Link>
            <div className="flex items-center gap-1.5 text-[11px] text-graphite">
              <span>营销中心</span>
              <ChevronRight className="h-3 w-3 text-dove" />
              <span className="text-ash">新建房源</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="h-px w-7 bg-rust" />
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-graphite">
                  Listing studio <span className="text-dove">/</span> 房源编辑室
                </span>
              </div>
              <h1 className="page-title mt-3 text-[44px] text-ink">创建新房源</h1>
              <p className="mt-2 max-w-[560px] text-[15px] leading-relaxed text-graphite">
                从基础信息到照片与改造进度，一次把房源资料补齐。保存后会同步到营销列表与客户端详情。
              </p>
            </div>
            <Link
              href="/admin/marketing"
              className="text-[12px] font-medium text-graphite transition-colors hover:text-ink"
            >
              取消并返回
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-cards bg-white px-5 py-3 shadow-steep-sm">
            {[
              ["01", "基础信息", "地址与房源标题"],
              ["02", "房源细节", "户型、价格与照片"],
              ["03", "发布", "状态与客户端展示"],
            ].map(([index, title, note], step) => (
              <React.Fragment key={index}>
                {step > 0 ? <ChevronRight className="h-3 w-3 text-dove" /> : null}
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-[10px] ${
                      step === 0 ? "bg-ink text-white" : "bg-fog text-graphite"
                    }`}
                  >
                    {index}
                  </span>
                  <span className="text-[12px] font-medium text-ink">{title}</span>
                  <span className="hidden text-[10px] text-dove sm:inline">{note}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </header>

        <MiniProjectForm mode="create" defaultConsultantId={currentUser} />
      </PageContainer>
    </div>
  );
}
