"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RecordDialog } from "@/components/finance/record-dialog";

interface LedgerDetailHeaderProps {
  projectId: string;
  projectCode: string | null;
  projectName: string | null;
  businessForm?: "agent" | "wholesale" | null;
}

export function LedgerDetailHeader({
  projectId,
  projectCode,
  projectName,
  businessForm,
}: LedgerDetailHeaderProps) {
  const router = useRouter();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleExport = () => {
    toast.info("单项目导出功能敬请期待");
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4 min-w-0">
        <Link
          href="/admin/ledger"
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          返回资金账本
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-foreground truncate">
          {projectCode ? (
            <span className="font-mono text-base text-muted-foreground mr-2">
              {projectCode}
            </span>
          ) : null}
          {projectName || "-"}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={handleExport}
        >
          <Download className="h-4 w-4" />
          导出
        </Button>
        <Button
          size="sm"
          className="gap-1.5 rounded-full"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          记一笔
        </Button>
      </div>

      <RecordDialog
        projectId={projectId}
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSuccess={() => router.refresh()}
        businessForm={businessForm}
      />
    </div>
  );
}
