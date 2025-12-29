"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation"; // [新增]
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Project } from "../../../../types";
import { updateProjectAction } from "../../../../actions/core";

interface SalesTeamPanelProps {
  project: Project;
}

export function SalesTeamPanel({ project }: SalesTeamPanelProps) {
  const router = useRouter();

  // 1. 初始化本地状态
  const [channel, setChannel] = useState("");
  const [presenter, setPresenter] = useState("");
  const [negotiator, setNegotiator] = useState("");

  // 2. [核心修复] 当 project 属性变化时（比如刷新后），同步到本地状态
  useEffect(() => {
    // 优先读取驼峰 channelManager，兼容下划线
    setChannel(project.channelManager || project.channel_manager || "");
    setPresenter(project.presenter || "");
    setNegotiator(project.negotiator || "");
  }, [project]);

  // 通用的失焦保存处理
  const handleBlur = async (
    field: string,
    value: string,
    oldValue?: string
  ) => {
    if (value === (oldValue || "")) return;

    // console.log(`[调试] 提交更新: ${field} = ${value}`);

    const toastId = toast.loading("正在保存...");
    try {
      const payload = { [field]: value };

      const res = await updateProjectAction(project.id, payload);

      if (res.success) {
        toast.success("保存成功");
        // 3. [核心修复] 保存成功后刷新路由，获取最新数据
        // 这会触发上面的 useEffect，确保数据一致性
        router.refresh();
      } else {
        toast.error(res.message);
        // 如果失败，建议重置回旧值 (可选)
      }
    } catch (error) {
      console.error(error);
      toast.error("保存失败");
    } finally {
      toast.dismiss(toastId);
    }
  };

  return (
    <div className="bg-slate-50/50 border border-slate-100 rounded-lg p-4 mb-6">
      <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
        销售团队{" "}
        <span className="text-[10px] font-normal text-slate-400 normal-case">
          (自动保存)
        </span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 1. 渠道 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">渠道</Label>
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            // 这里的 oldValue 也要取正确，防止重复提交
            onBlur={() =>
              handleBlur(
                "channelManager",
                channel,
                project.channelManager || project.channel_manager
              )
            }
            className="h-8 text-sm bg-white focus-visible:ring-emerald-500"
            placeholder="姓名"
          />
        </div>

        {/* 2. 讲房 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">讲房</Label>
          <Input
            value={presenter}
            onChange={(e) => setPresenter(e.target.value)}
            onBlur={() => handleBlur("presenter", presenter, project.presenter)}
            className="h-8 text-sm bg-white focus-visible:ring-emerald-500"
            placeholder="姓名"
          />
        </div>

        {/* 3. 谈判 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">谈判</Label>
          <Input
            value={negotiator}
            onChange={(e) => setNegotiator(e.target.value)}
            onBlur={() =>
              handleBlur("negotiator", negotiator, project.negotiator)
            }
            className="h-8 text-sm bg-white focus-visible:ring-emerald-500"
            placeholder="姓名"
          />
        </div>
      </div>
    </div>
  );
}
