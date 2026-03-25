"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { syncL4MarketingProjectsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    try {
      setLoading(true);
      const result = await syncL4MarketingProjectsAction();
      if (result.success) {
        const maybeData = result.data as unknown;
        let syncedCount = 0;
        if (typeof maybeData === "object" && maybeData) {
          const record = maybeData as Record<string, unknown>;
          if (typeof record.total_synced === "number")
            syncedCount = record.total_synced;
        }
        toast.success(`已同步 ${syncedCount} 个新项目到L4营销层`);
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
    <Button
      onClick={handleSync}
      disabled={loading}
      variant="outline"
      className="bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      同步新项目
    </Button>
  );
}
