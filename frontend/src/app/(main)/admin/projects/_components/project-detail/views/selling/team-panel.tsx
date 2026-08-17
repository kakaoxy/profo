"use client";

import { logger } from "@/lib/logger";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Project } from "../../../../types";
import { getSalesUsersSimpleAction, updateSalesRolesAction } from "../../../../actions/sales";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

interface SalesTeamPanelProps {
  project: Project;
}

interface UserOption {
  id: string;
  nickname: string | null;
  username: string;
}

type RoleField = "channel_manager_id" | "property_agent_id" | "negotiator_id";

interface RoleConfig {
  field: RoleField;
  /** 角色描述（设计稿 person.prole：角色名 · 职责） */
  roleLabel: string;
  placeholder: string;
  avatarBg: string;
}

// 头像三色轮换：apricot → sky → mint（设计稿 .avatar peach/skyb/mint）
const ROLE_CONFIGS: RoleConfig[] = [
  {
    field: "channel_manager_id",
    roleLabel: "渠道经理 · 负责分销对接",
    placeholder: "选择渠道负责人",
    avatarBg: "bg-apricot-wash",
  },
  {
    field: "property_agent_id",
    roleLabel: "讲房人 · 负责接待讲解",
    placeholder: "选择讲房人",
    avatarBg: "bg-sky-wash",
  },
  {
    field: "negotiator_id",
    roleLabel: "谈判人 · 负责价格谈判",
    placeholder: "选择谈判人",
    avatarBg: "bg-[#ddeddd]",
  },
];

export function SalesTeamPanel({ project }: SalesTeamPanelProps) {
  const router = useRouter();

  // 1. 初始化本地状态 - 使用ID而非文本
  const [roleIds, setRoleIds] = useState<Record<RoleField, string | null>>({
    channel_manager_id: null,
    property_agent_id: null,
    negotiator_id: null,
  });

  // 用户列表
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // 2. 加载用户列表
  useEffect(() => {
    let mounted = true;
    getSalesUsersSimpleAction().then((result) => {
      if (mounted) {
        if (result.success && result.data) {
          setUsers(result.data);
        } else {
          logger.error("获取用户列表失败:", result.message);
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
    setRoleIds({
      channel_manager_id: project.channel_manager_id || null,
      property_agent_id: project.property_agent_id || null,
      negotiator_id: project.negotiator_id || null,
    });
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
  const handleSave = async (field: RoleField, value: string | null, oldValue?: string | null) => {
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
      logger.error(error);
      toast.error("保存失败");
    } finally {
      toast.dismiss(toastId);
    }
  };

  return (
    <div className="mb-5 rounded-cards bg-pure-white p-5 shadow-steep md:p-6">
      {/* 卡头（设计稿 .card-head：mb-16px） */}
      <div className="mb-4">
        <div className="text-base font-[500] text-ink">销售团队</div>
        <div className="mt-0.5 text-[13px] text-graphite">选择成员后自动保存</div>
      </div>

      {/* person 行（设计稿 .person：头像 + 姓名 + 角色描述 + 已保存 pill） */}
      {ROLE_CONFIGS.map((config) => {
        const currentId = roleIds[config.field];
        const displayName = getUserDisplayName(currentId);
        const oldValue = (project[config.field] as string | null | undefined) || null;

        return (
          <div
            key={config.field}
            className="flex items-center gap-3 border-b border-[#f0f0f2] py-[11px] last:border-b-0"
          >
            {/* 38px 圆形头像：三色轮换，字=姓名首字 */}
            <span
              className={cn(
                "flex size-[38px] shrink-0 items-center justify-center rounded-full text-[13px] font-medium text-ink",
                config.avatarBg,
              )}
            >
              {displayName ? displayName.charAt(0) : "?"}
            </span>

            <div className="min-w-0 flex-1">
              {/* 姓名：有权限=行内 Select（选择后自动保存），无权限=只读文本 */}
              <HasPermission
                code={PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM}
                fallback={
                  <span
                    className={cn(
                      "text-[14.5px] font-[480]",
                      displayName ? "text-ink" : "text-graphite",
                    )}
                  >
                    {isLoadingUsers ? "加载中..." : displayName || "未设置"}
                  </span>
                }
              >
                <Select
                  value={currentId || "__empty__"}
                  onValueChange={(value) => {
                    const newValue = value === "__empty__" ? null : value;
                    setRoleIds((prev) => ({ ...prev, [config.field]: newValue }));
                    handleSave(config.field, newValue, oldValue);
                  }}
                  disabled={isLoadingUsers}
                >
                  <SelectTrigger className="h-auto w-fit gap-1.5 border-0 bg-transparent px-0 py-0.5 text-[14.5px] font-[480] text-ink shadow-none focus-visible:ring-0">
                    <SelectValue placeholder={config.placeholder}>
                      {displayName || config.placeholder}
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
              </HasPermission>

              <div className="mt-0.5 text-[13px] text-graphite">{config.roleLabel}</div>
            </div>

            {/* 已保存 pill：白底灰描边小胶囊，13px（设计稿 .pill.form） */}
            {currentId && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-[#e2e2e5] bg-pure-white px-[13px] py-[5px] text-[13px] font-[450] text-graphite">
                已保存
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
