import React from "react";

import { fetchClient } from "@/lib/api-server";
import type { Consultant } from "../types";
import { MiniProjectForm } from "../_components/mini-project-form";
import { MiniproShell } from "../../_components/minipro-shell";

export const dynamic = "force-dynamic";

export default async function ProjectCreatePage() {
  const client = await fetchClient();

  const consultantsRes = await client.GET("/api/v1/admin/mini/consultants", {
    params: { query: { page: 1, page_size: 100 } },
  });

  const consultants: Consultant[] = consultantsRes.data?.items || [];

  return (
    <MiniproShell containerClassName="max-w-none px-0 py-0">
      <MiniProjectForm mode="create" consultants={consultants} />
    </MiniproShell>
  );
}
