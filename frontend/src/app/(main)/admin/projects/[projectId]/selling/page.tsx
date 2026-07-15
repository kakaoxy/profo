import { notFound } from "next/navigation";

import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";
import { MobileSellingView } from "../_components/mobile-selling-view";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function SellingPage({ params }: PageProps) {
  const { projectId } = await params;

  // 单项目详情接口始终返回 sales_records (slim=False)，
  // 无需也不支持 include_interactions 查询参数（该参数仅用于列表接口）
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/projects/{project_id}", {
    params: {
      path: { project_id: projectId },
    },
  });

  if (error || !data) {
    notFound();
  }

  const project = extractApiData<ProjectResponse>(data);
  if (!project) {
    notFound();
  }

  return <MobileSellingView projectId={projectId} project={project} />;
}
