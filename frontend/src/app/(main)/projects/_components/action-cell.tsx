"use client";

import { useCallback } from "react";
import { Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { LineChart, Wallet } from "lucide-react";
import Link from "next/link";
import { DeleteConfirmButton } from "@/components/common";
import { Project } from "../types";
import { deleteProjectAction } from "../actions/core";

interface ActionCellProps {
  row: Row<Project>;
}

export function ActionCell({ row }: ActionCellProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const monitorHref = `?monitor_id=${row.original.id}&project_name=${encodeURIComponent(row.original.name)}`;
  const cashflowHref = `?cashflow_id=${row.original.id}&community_name=${encodeURIComponent(row.original.community_name || "")}&address=${encodeURIComponent(row.original.address || "")}`;

  return (
    <div className="flex items-center gap-1">
      <Link href={monitorHref} scroll={false} onClick={handleClick}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
        >
          <LineChart className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">监控</span>
        </Button>
      </Link>

      <Link href={cashflowHref} scroll={false} onClick={handleClick}>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-success hover:bg-success-container h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
        >
          <Wallet className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">账本</span>
        </Button>
      </Link>

      <div className="hidden sm:block">
        <DeleteConfirmButton
          onDelete={async () => {
            const res = await deleteProjectAction(row.original.id);
            return res;
          }}
          description="此操作将把项目标记为删除状态。"
        />
      </div>
    </div>
  );
}
