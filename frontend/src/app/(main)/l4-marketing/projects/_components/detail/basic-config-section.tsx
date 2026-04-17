"use client";

import { memo } from "react";
import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { User } from "lucide-react";
import {
  getStatusConfig,
  getPublishStatusConfig,
  formatDate,
} from "./utils";
import { getUserByIdAction } from "@/app/(main)/users/actions";
import type { BasicConfigSectionProps } from "./types";
import type { UserResponse } from "@/app/(main)/users/actions";

// 状态卡片组件
interface StatusCardProps {
  label: string;
  badge: React.ReactNode;
  color: "green" | "gray";
}

function StatusCard({ label, badge, color }: StatusCardProps) {
  const bgClass = color === "green" ? "bg-emerald-50" : "bg-slate-50";
  const borderClass = color === "green" ? "border-emerald-100" : "border-slate-100";

  return (
    <div className={`rounded-lg p-4 ${bgClass} border ${borderClass}`}>
      <div className="text-xs text-slate-500 mb-2">{label}</div>
      <div>{badge}</div>
    </div>
  );
}

// 管理配置项组件
interface ConfigItemProps {
  label: string;
  value: React.ReactNode;
}

function ConfigItem({ label, value }: ConfigItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-700">{value}</span>
    </div>
  );
}

// 使用 SWR 获取顾问信息
function useConsultant(consultantId: string | null | undefined) {
  const { data, error, isLoading } = useSWR(
    consultantId ? [`user`, consultantId] : null,
    async ([, id]) => {
      const result = await getUserByIdAction(id);
      if (result.success && result.data) {
        return result.data as UserResponse;
      }
      // 处理错误情况 - 使用类型守卫获取错误消息
      const errorMessage = !result.success
        ? result.message
        : "获取顾问信息失败";
      throw new Error(errorMessage);
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60000, // 1分钟内去重
    }
  );

  return {
    consultant: data || null,
    isLoading,
    error,
  };
}

// 使用 memo 避免不必要的重渲染
export const BasicConfigSection = memo(function BasicConfigSection({
  project,
}: BasicConfigSectionProps) {
  // 简单的配置查找直接使用函数调用，无需 useMemo
  const statusConfig = getStatusConfig(project.project_status || "在途");
  const publishConfig = getPublishStatusConfig(project.publish_status || "草稿");

  // 使用 SWR 获取顾问信息（替代 useEffect + useState）
  const { consultant, isLoading: isLoadingConsultant } = useConsultant(project.consultant_id);

  return (
    <div className="space-y-4">
      {/* 房源状态区域 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">房源状态</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* 发布状态 */}
          <StatusCard
            label="发布状态"
            color={project.publish_status === "发布" ? "green" : "gray"}
            badge={
              <Badge
                variant="secondary"
                className={`${publishConfig.className} text-xs font-semibold border-0 px-2.5 py-1`}
              >
                {publishConfig.label}
              </Badge>
            }
          />

          {/* 项目进度 */}
          <StatusCard
            label="项目进度"
            color={project.project_status === "在售" ? "green" : "gray"}
            badge={
              <Badge
                variant="secondary"
                className={`${statusConfig.className} text-xs font-semibold border-0 px-2.5 py-1`}
              >
                {statusConfig.label}
              </Badge>
            }
          />
        </div>
      </div>

      {/* 管理配置区域 */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="text-sm font-medium text-slate-700 mb-3">管理配置</h3>
        <div className="grid grid-cols-4 gap-4">
          <ConfigItem
            label="排序权重"
            value={project.sort_order ?? 0}
          />
          <ConfigItem
            label="关联顾问"
            value={
              isLoadingConsultant ? (
                <span className="text-slate-400">加载中...</span>
              ) : consultant ? (
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" />
                  <span>{consultant.nickname || consultant.username}</span>
                </div>
              ) : project.consultant_id ? (
                <span className="text-slate-400">顾问未找到</span>
              ) : (
                "-"
              )
            }
          />
          <ConfigItem
            label="关联L3项目ID"
            value={project.project_id ?? "-"}
          />
          <ConfigItem
            label="最后更新"
            value={formatDate(project.updated_at)}
          />
        </div>
      </div>
    </div>
  );
});
