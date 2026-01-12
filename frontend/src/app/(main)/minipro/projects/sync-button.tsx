"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { syncMiniProjectsAction } from "./actions";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    try {
      setLoading(true);
      const result = await syncMiniProjectsAction();
      if (result.success) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = result.data as any;
        toast.success(`已同步 ${data?.synced_count || 0} 个项目，共 ${data?.total_active || 0} 个活跃项目`);
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
    <button 
      onClick={handleSync} 
      disabled={loading} 
      className="flex items-center gap-2 px-6 py-2.5 bg-white text-gray-700 font-semibold text-sm rounded-xl shadow-[0_2px_12px_0_rgba(0,0,0,0.05)] hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      <span className={`material-symbols-outlined text-lg ${loading ? "animate-spin" : ""}`}>sync</span>
      同步新项目
    </button>
  );
}

