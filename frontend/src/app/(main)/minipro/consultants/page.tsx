import { getConsultantsAction } from "../projects/actions";
import type { Consultant } from "../projects/types";
import { DataTable } from "@/components/ui/data-table";
import { columns } from "./columns";
import { ConsultantDialog } from "./consultant-dialog";
import { MiniproPageHeader, MiniproShell } from "../_components/minipro-shell";

export default async function ConsultantsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const page = Number(params?.page) || 1;
  const pageSize = Number(params?.page_size) || 20;

  const result = await getConsultantsAction(page, pageSize);
  const items: Consultant[] =
    result.success && result.data && "items" in result.data
      ? (result.data as { items: Consultant[] }).items
      : [];

  return (
    <MiniproShell>
      <MiniproPageHeader
        title="置业顾问管理"
        description="管理小程序端的置业顾问列表"
        actions={<ConsultantDialog mode="create" />}
      />
      <div className="rounded-md border bg-background">
        <DataTable columns={columns} data={items} container={false} />
      </div>
    </MiniproShell>
  );
}
