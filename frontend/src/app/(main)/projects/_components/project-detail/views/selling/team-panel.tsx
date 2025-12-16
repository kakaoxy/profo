"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Project } from "../../../../types";
import { updateProjectAction } from "../../../../actions";

interface SalesTeamPanelProps {
  project: Project;
}

export function SalesTeamPanel({ project }: SalesTeamPanelProps) {
  const [channel, setChannel] = useState(project.channel_manager || "");
  const [presenter, setPresenter] = useState(project.presenter || "");
  const [negotiator, setNegotiator] = useState(project.negotiator || "");

  // 通用的失焦保存处理
  const handleBlur = async (
    field: string,
    value: string,
    oldValue?: string
  ) => {
    // 如果值没有变化，不发送请求
    // 注意：oldValue 可能是 undefined，所以要做空值处理
    if (value === (oldValue || "")) return;

    const toastId = toast.loading("正在保存团队信息...");
    try {
      // 构造更新 Payload
      const payload = { [field]: value };

      const res = await updateProjectAction(project.id, payload);

      if (res.success) {
        toast.success("保存成功");
      } else {
        toast.error(res.message);
      }
    } catch {
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
      <div className="grid grid-cols-3 gap-4">
        {/* 1. 渠道维护 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">渠道维护</Label>
          <Input
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            onBlur={() =>
              handleBlur("channel_manager", channel, project.channel_manager)
            }
            className="h-8 text-sm bg-white focus-visible:ring-emerald-500"
            placeholder="姓名"
          />
        </div>

        {/* 2. 房源主讲 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">房源主讲</Label>
          <Input
            value={presenter}
            onChange={(e) => setPresenter(e.target.value)}
            onBlur={() => handleBlur("presenter", presenter, project.presenter)}
            className="h-8 text-sm bg-white focus-visible:ring-emerald-500"
            placeholder="姓名"
          />
        </div>

        {/* 3. 谈判专家 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">谈判专家</Label>
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
