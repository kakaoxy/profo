import React from 'react';
import { fetchClient } from '@/lib/api-server';
import type { MiniProject, Consultant, MiniProjectPhoto } from '../types';
import { MiniProjectEditForm } from './edit-form';

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
    <div className="h-full flex-1 flex-col space-y-8 p-0 md:flex overflow-y-auto">
      <MiniProjectEditForm 
        project={project} 
        consultants={consultants} 
        initialPhotos={photos}
      />
    </div>
  );
}

