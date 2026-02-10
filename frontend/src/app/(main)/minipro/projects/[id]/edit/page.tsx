import React from "react";

import { fetchClient } from "@/lib/api-server";
import type { Consultant, MiniProject, MiniProjectPhoto } from "../../types";
import { MiniProjectForm } from "../../_components/mini-project-form";
import { MiniproShell } from "../../../_components/minipro-shell";

export const dynamic = "force-dynamic";

export default async function ProjectEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await fetchClient();

  const [projectRes, consultantsRes, photosRes] = await Promise.all([
    client.GET("/api/v1/admin/mini/projects/{id}", {
      params: { path: { id } },
    }),
    client.GET("/api/v1/admin/mini/consultants", {
      params: { query: { page: 1, page_size: 100 } },
    }),
    client.GET("/api/v1/admin/mini/projects/{id}/photos", {
      params: { path: { id } },
    }),
  ]);

  if (projectRes.error || !projectRes.data) {
    const statusCode =
      typeof projectRes.error === "object" &&
      projectRes.error &&
      "status" in projectRes.error
        ? Number((projectRes.error as { status?: unknown }).status)
        : undefined;
    const message =
      statusCode === 401 || statusCode === 403
        ? "没有权限访问该项目（请重新登录或联系管理员开通权限）"
        : "获取项目详情失败，请稍后重试";
    return (
      <div className="p-8 text-center text-red-500">
        <div className="text-sm font-semibold">{message}</div>
        {statusCode ? (
          <div className="mt-2 text-xs text-slate-500">
            状态码: {statusCode}
          </div>
        ) : null}
      </div>
    );
  }

  const project = projectRes.data as MiniProject;
  const consultants: Consultant[] = consultantsRes.data?.items || [];
  const photos: MiniProjectPhoto[] = photosRes.data || [];

  return (
    <MiniproShell containerClassName="max-w-none px-0 py-0">
      <MiniProjectForm
        mode="edit"
        consultants={consultants}
        initialProject={project}
        initialPhotos={photos}
      />
    </MiniproShell>
  );
}
