"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Project } from "../../../../types";
import { getUsersSimpleAction, updateSalesRolesAction } from "../../../../actions/sales";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SalesTeamPanelProps {
  project: Project;
}

interface UserOption {
  id: string;
  nickname: string | null;
  username: string;
}

export function SalesTeamPanel({ project }: SalesTeamPanelProps) {
  const router = useRouter();

  // 1. 初始化本地状态 - 使用ID而非文本
  const [channelManagerId, setChannelManagerId] = useState<string | null>(null);
  const [propertyAgentId, setPropertyAgentId] = useState<string | null>(null);
  const [negotiatorId, setNegotiatorId] = useState<string | null>(null);

  // 用户列表
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // 2. 加载用户列表
  useEffect(() => {
    let mounted = true;
    getUsersSimpleAction().then((result) => {
      if (mounted) {
        if (result.success && result.data) {
          setUsers(result.data);
        } else {
          console.error("获取用户列表失败:", result.message);
        }
        setIsLoadingUsers(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // 3. 当 project 属性变化时（比如刷新后），同步到本地状态
  useEffect(() => {
    setChannelManagerId(project.channel_manager_id || null);
    setPropertyAgentId(project.property_agent_id || null);
    setNegotiatorId(project.negotiator_id || null);
  }, [project]);

  // 获取用户显示名称
  const getUserDisplayName = useCallback(
    (userId: string | null): string => {
      if (!userId) return "";
      const user = users.find((u) => u.id === userId);
      return user?.nickname || user?.username || "";
    },
    [users],
  );

  // 通用的保存处理
  const handleSave = async (
    field: "channel_manager_id" | "property_agent_id" | "negotiator_id",
    value: string | null,
    oldValue?: string | null,
  ) => {
    if (value === oldValue) return;

    const toastId = toast.loading("正在保存...");
    try {
      const payload = { [field]: value };

      const res = await updateSalesRolesAction(project.id, payload);

      if (res.success) {
        toast.success("保存成功");
        router.refresh();
      } else {
        toast.error(res.message || "保存失败");
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
          <Select
            value={channelManagerId || "__empty__"}
            onValueChange={(value) => {
              const newValue = value === "__empty__" ? null : value;
              setChannelManagerId(newValue);
              handleSave(
                "channel_manager_id",
                newValue,
                project.channel_manager_id || null,
              );
            }}
            disabled={isLoadingUsers}
          >
            <SelectTrigger className="h-8 text-sm bg-white focus:ring-emerald-500 w-full">
              <SelectValue placeholder="选择渠道负责人">
                {getUserDisplayName(channelManagerId) || "选择渠道负责人"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">未选择</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.nickname || user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 2. 讲房 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">讲房</Label>
          <Select
            value={propertyAgentId || "__empty__"}
            onValueChange={(value) => {
              const newValue = value === "__empty__" ? null : value;
              setPropertyAgentId(newValue);
              handleSave(
                "property_agent_id",
                newValue,
                project.property_agent_id || null,
              );
            }}
            disabled={isLoadingUsers}
          >
            <SelectTrigger className="h-8 text-sm bg-white focus:ring-emerald-500 w-full">
              <SelectValue placeholder="选择讲房人">
                {getUserDisplayName(propertyAgentId) || "选择讲房人"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">未选择</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.nickname || user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 3. 谈判 */}
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">谈判</Label>
          <Select
            value={negotiatorId || "__empty__"}
            onValueChange={(value) => {
              const newValue = value === "__empty__" ? null : value;
              setNegotiatorId(newValue);
              handleSave(
                "negotiator_id",
                newValue,
                project.negotiator_id || null,
              );
            }}
            disabled={isLoadingUsers}
          >
            <SelectTrigger className="h-8 text-sm bg-white focus:ring-emerald-500 w-full">
              <SelectValue placeholder="选择谈判人">
                {getUserDisplayName(negotiatorId) || "选择谈判人"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__empty__">未选择</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.nickname || user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
