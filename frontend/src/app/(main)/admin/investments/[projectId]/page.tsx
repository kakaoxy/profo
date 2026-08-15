import { Suspense } from "react";
import { redirect } from "next/navigation";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { InvestmentDetailView } from "./_components/investment-detail-view";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function InvestmentDetailPage({ params }: PageProps) {
  const { projectId } = await params;

  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/investments/by-project/{project_id}", {
    params: { path: { project_id: projectId } },
  });

  // 跟投记录不存在 → 跳转列表页并弹出新增弹框（预选该项目）
  if (error || !data) {
    redirect(`/admin/investments?create=1&project_id=${projectId}`);
  }

  const investment = extractApiData<InvestmentResponse>(data);

  if (!investment) {
    redirect(`/admin/investments?create=1&project_id=${projectId}`);
  }

  return (
    <div className="min-h-screen bg-muted">
      <div className="w-full max-w-[1200px] mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8">
        <Suspense fallback={null}>
          <InvestmentDetailView investment={investment} />
        </Suspense>
      </div>
    </div>
  );
}
