"use client";

import { logger } from "@/lib/logger";
import * as React from "react";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getUsersSimpleAction } from "@/app/(main)/admin/users/actions";
import type { ConsultantSelectProps, UserSimpleResponse } from "./types";

/**
 * 顾问选择组件
 *
 * 提供房源顾问的搜索和选择功能
 * 支持显示顾问昵称/用户名，并提供清除选择功能
 *
 * @example
 * ```tsx
 * <ConsultantSelect
 *   value="user-uuid"
 *   onChange={(id) => logger.devDebug(id)}
 * />
 * ```
 */
export function ConsultantSelect({ value, onChange }: ConsultantSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [consultants, setConsultants] = React.useState<UserSimpleResponse[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedConsultantName, setSelectedConsultantName] = React.useState<string | null>(null);

  // 加载顾问列表
  React.useEffect(() => {
    const fetchConsultants = async () => {
      setLoading(true);
      try {
        const result = await getUsersSimpleAction({ status: "active" });
        if (result.success && result.data?.items) {
          setConsultants(result.data.items);
          if (value) {
            const found = result.data.items.find(c => c.id === value);
            if (found) {
              setSelectedConsultantName(found.nickname || found.username);
            }
          }
        } else {
          setConsultants([]);
        }
      } catch (err) {
        logger.error("Failed to fetch consultants:", err);
        setConsultants([]);
      } finally {
        setLoading(false);
      }
    };

    fetchConsultants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 更新选中顾问的显示名称
  React.useEffect(() => {
    if (value && consultants.length > 0) {
      const found = consultants.find(c => c.id === value);
      if (found) {
        setSelectedConsultantName(found.nickname || found.username);
      }
    } else if (!value) {
      setSelectedConsultantName(null);
    }
  }, [value, consultants]);

  const selectedConsultant = consultants.find(c => c.id === value);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider">
        房源顾问
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-(--border)/50 hover:bg-primary hover:text-foreground bg-card"
          >
            <div className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className={cn("truncate", !selectedConsultantName && !selectedConsultant && "text-muted-foreground font-normal")}>
                {selectedConsultantName || (selectedConsultant ? `${selectedConsultant.nickname || selectedConsultant.username}` : "选择房源顾问...")}
              </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 rounded-xl" align="start">
          <div className="max-h-[300px] overflow-y-auto p-1">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <span className="text-xs">加载中...</span>
              </div>
            ) : null}

            {!loading && consultants.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                暂无顾问数据
              </div>
            ) : null}

            {!loading && consultants.map((consultant) => (
              <button
                key={consultant.id}
                className={cn(
                  "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-primary transition-colors group text-left",
                  value === consultant.id && "bg-primary/10 text-primary font-bold"
                )}
                onClick={() => {
                  onChange(consultant.id);
                  setOpen(false);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-foreground">
                    {consultant.nickname || consultant.username}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {consultant.username}
                  </span>
                </div>
                {value === consultant.id && <Check className="h-4 w-4" />}
              </button>
            ))}

            {/* 清除选择选项 */}
            {!loading && value ? (
              <div className="p-1 border-t border-(--border)/20 mt-1">
                <button
                  className="w-full flex items-center gap-2 p-3 text-sm text-muted-foreground hover:bg-(--error)/30 rounded-lg transition-colors"
                  onClick={() => {
                    onChange(undefined);
                    setOpen(false);
                  }}
                >
                  <span>清除选择</span>
                </button>
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
