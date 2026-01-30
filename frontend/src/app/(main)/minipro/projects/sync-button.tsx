"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { syncMiniProjectsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    try {
      setLoading(true);
      const result = await syncMiniProjectsAction();
      if (result.success) {
        const maybeData = result.data as unknown;
        let syncedCount = 0;
        let totalActive = 0;
        if (typeof maybeData === "object" && maybeData) {
          const record = maybeData as Record<string, unknown>;
          if (typeof record.synced_count === "number")
            syncedCount = record.synced_count;
          if (typeof record.total_active === "number")
            totalActive = record.total_active;
        }
        toast.success(
          `已同步 ${syncedCount} 个项目，共 ${totalActive} 个活跃项目`,
        );
        router.refresh();
      } else {
        toast.error(result.error || "同步失败");
      }
    } catch (error) {
      toast.error("同步失败");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSync} disabled={loading} variant="outline">
      <RefreshCw className={loading ? "animate-spin" : ""} />
      同步新项目
    </Button>
  );
}
