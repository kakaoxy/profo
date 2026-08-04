import { notFound } from "next/navigation";

import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import type { components } from "@/lib/api-types";

import type { Project } from "../types";
import { ProjectDetailPageView } from "./_components/project-detail-page-view";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface PageProps {
  params: Promise<{ projectId: string }>;
}

/**
 * 项目详情页路由 /admin/projects/{projectId}
 *
 * 此前项目详情仅通过 ProjectDetailSheet（侧滑面板）展示，直接访问 URL 返回 404。
 * 本页面为 Server Component，获取项目数据后交给 ProjectDetailPageView 渲染，
 * 复用与 Sheet 相同的 hooks 与 views，解除 PM-03/04/05 等下游用例阻塞。
 */
export default async function ProjectDetailPage({ params }: PageProps) {
  const { projectId } = await params;

  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/projects/{project_id}", {
    params: {
      path: { project_id: projectId },
    },
  });

  if (error || !data) {
    notFound();
  }

  const projectData = extractApiData<ProjectResponse>(data);
  if (!projectData) {
    notFound();
  }

  // 与 useProjectDetail.refreshProjectData 的 {...prev, ...res.data} as Project 一致，
  // 初始数据由 hook 在挂载时通过 getProjectDetailAction 拉取完整数据刷新
  const project = {
    ...projectData,
    name: projectData.name ?? "",
  } as Project;

  return <ProjectDetailPageView initialProject={project} />;
}
