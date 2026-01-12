import { fetchClient } from "@/lib/api-server";
import { MiniProjectEditForm } from "./edit-form";
import type { MiniProject, Consultant, MiniProjectPhoto } from "../types";

export const dynamic = "force-dynamic";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await fetchClient();
  
  // Fetch data in parallel
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

  if (projectRes.error) {
    console.error("Failed to fetch project:", projectRes.error);
  }

  const project = projectRes.data as MiniProject;
  const consultants: Consultant[] = consultantsRes.data && 'items' in consultantsRes.data ? (consultantsRes.data as { items: Consultant[] }).items : [];
  const photos: MiniProjectPhoto[] = photosRes.data as MiniProjectPhoto[] || [];

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">编辑项目</h2>
          <p className="text-muted-foreground">
             {/* @ts-expect-error: project_name missing in generated type */}
             {project?.project_name || "未知项目"}
          </p>
        </div>
      </div>
{/* ... */}
      
      <div className="max-w-4xl">
         <MiniProjectEditForm 
            project={project} 
            consultants={consultants} 
            initialPhotos={photos}
          />
      </div>
    </div>
  );
}

