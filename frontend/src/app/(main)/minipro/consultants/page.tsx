import { getConsultantsAction } from "../projects/actions";
import type { Consultant } from "../projects/types";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { ConsultantDialog } from "./consultant-dialog";

export default async function ConsultantsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(params?.page) || 1;
  const pageSize = Number(params?.page_size) || 20;

  const result = await getConsultantsAction(page, pageSize);
  const items: Consultant[] = result.success && result.data && 'items' in result.data ? (result.data as { items: Consultant[] }).items : [];

  return (
    <div className="h-full flex-1 flex-col space-y-8 p-8 md:flex">
      <div className="flex items-center justify-between space-y-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">置业顾问管理</h2>
          <p className="text-muted-foreground">
            管理小程序端的置业顾问列表
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <ConsultantDialog mode="create" />
        </div>
      </div>
      <div className="rounded-md border bg-white">
         <DataTable columns={columns} data={items} />
      </div>
    </div>
  );
}
