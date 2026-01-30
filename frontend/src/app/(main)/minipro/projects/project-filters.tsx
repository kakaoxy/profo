"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useDebouncedCallback } from "use-debounce";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ProjectFilters({
  initialQuery = "",
  initialStatus = "all",
}: {
  initialQuery?: string;
  initialStatus?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [queryValue, setQueryValue] = useState(initialQuery);
  const [statusValue, setStatusValue] = useState(initialStatus);

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
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          className="pl-9 pr-9"
          placeholder="搜索项目名称或 ID..."
          type="text"
          value={queryValue}
          onChange={(e) => {
            const nextValue = e.target.value;
            setQueryValue(nextValue);
            handleSearch(nextValue);
          }}
          aria-label="搜索项目"
        />
        {isPending && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
      <div className="w-[180px]">
        <Select
          value={statusValue}
          onValueChange={(nextValue) => {
            setStatusValue(nextValue);
            handleStatusChange(nextValue);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="筛选状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有状态</SelectItem>
            <SelectItem value="published">已发布</SelectItem>
            <SelectItem value="draft">未发布</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
