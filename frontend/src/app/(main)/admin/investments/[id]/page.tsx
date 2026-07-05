import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { InvestmentDetailView } from "./_components/investment-detail-view";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function InvestmentDetailPage({ params }: PageProps) {
  const { id } = await params;

  const client = await fetchClient();
  const { data, error } = await client.GET(
    "/api/v1/admin/investments/{investment_id}",
    { params: { path: { investment_id: id } } },
  );

  if (error || !data) {
    notFound();
  }

  const investment = extractApiData<InvestmentResponse>(data);

  if (!investment) {
    notFound();
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
