"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";

export function ProjectFilters({ 
  initialQuery = "", 
  initialStatus = "all" 
}: { 
  initialQuery?: string, 
  initialStatus?: string 
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSearch = useDebouncedCallback((term: string) => {
    const params = new URLSearchParams(searchParams);
    if (term) {
      params.set("query", term);
    } else {
      params.delete("query");
    }
    params.set("page", "1"); // Reset to page 1 on search
    
    startTransition(() => {
      router.push(`/minipro/projects?${params.toString()}`);
    });
  }, 300);

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams);
    if (status && status !== "all") {
      params.set("status", status);
    } else {
      params.delete("status");
    }
    params.set("page", "1"); // Reset to page 1 on filter
    
    startTransition(() => {
      router.push(`/minipro/projects?${params.toString()}`);
    });
  };

  return (
    <div className="flex items-center gap-3 flex-1 max-w-2xl">
      <div className="relative flex-1">
        <input 
          className="w-full pl-10 pr-4 py-2.5 bg-white border-none rounded-xl shadow-[0_2px_12px_0_rgba(0,0,0,0.05)] focus:ring-2 focus:ring-[#137fec] text-sm" 
          placeholder="搜索项目名称或 ID..." 
          type="text"
          defaultValue={initialQuery}
          onChange={(e) => handleSearch(e.target.value)}
        />
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#137fec]"></div>
          </div>
        )}
      </div>
      <div className="relative w-48">
        <select 
          className="w-full pl-4 pr-10 py-2.5 bg-white border-none rounded-xl shadow-[0_2px_12px_0_rgba(0,0,0,0.05)] appearance-none focus:ring-2 focus:ring-[#137fec] text-sm"
          defaultValue={initialStatus}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="all">所有状态</option>
          <option value="published">已发布</option>
          <option value="draft">未发布</option>
        </select>
      </div>
    </div>
  );
}
