"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getL4MarketingProjectsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    try {
      setLoading(true);
      // 刷新列表以获取最新数据
      const result = await getL4MarketingProjectsAction(1, 20);
      if (result.success) {
        toast.success("项目列表已刷新");
        router.refresh();
      } else {
        toast.error(result.error || "刷新失败");
      }
    } catch (error) {
      toast.error("刷新失败");
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
      刷新列表
    </Button>
  );
}
