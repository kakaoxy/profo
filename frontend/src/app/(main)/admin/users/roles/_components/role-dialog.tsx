"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import useSWR from "swr";
import { useState } from "react";
import { CheckIcon, ChevronDownIcon, Loader2, MinusIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { fetcher } from "@/lib/swr";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";

import { useRoleForm } from "./use-role-form";
import type { RoleResponse } from "@/app/(main)/admin/users/actions/index";

type PermissionModuleGroup = components["schemas"]["PermissionModuleGroup"];
type PermissionResponse = components["schemas"]["PermissionResponse"];

/** SWR key：后端按模块分组的权限字典端点 */
const PERMISSION_MODULES_KEY = "/api/v1/permissions/modules";

/**
 * 模块代码 → 中文名称映射。
 *
 * 仅用于权限选择器标题展示，未知模块回退为原始 code。
 * 刻意放在组件内而不入 constants.ts（通用文件不应承载此业务映射）。
 */
const MODULE_LABELS: Record<string, string> = {
  user: "用户管理",
  role: "角色管理",
  permission: "权限字典",
  property: "房源管理",
  lead: "线索管理",
  project: "项目管理",
  ledger: "财务台账",
  investment: "投资管理",
  l4_marketing: "市场营销",
  operation_log: "审计日志",
  api_key: "API Key",
  valuation: "估价",
};

function getModuleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module;
}

interface RoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: RoleResponse | null;
}

export function RoleDialog({ open, onOpenChange, role }: RoleDialogProps) {
  const { form, isPending, isEdit, onSubmit } = useRoleForm({ role, open, onOpenChange });

  const { data: permissionGroups, isLoading, error } = useSWR<PermissionModuleGroup[]>(
    PERMISSION_MODULES_KEY,
    fetcher,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑角色" : "新建角色"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改现有角色信息及权限配置" : "创建一个新角色并分配权限"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色名称</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：财务专员" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>角色代码</FormLabel>
                  <FormControl>
                    <Input placeholder="例如：finance_staff" {...field} disabled={isEdit} />
                  </FormControl>
                  <FormDescription>角色唯一标识，创建后不可修改</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>描述</FormLabel>
                  <FormControl>
                    <Textarea placeholder="描述角色的职责和权限范围" {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permission_codes"
              render={({ field }) => {
                const selectedCodes: string[] = field.value ?? [];

                return (
                  <FormItem>
                    <div className="mb-2">
                      <FormLabel className="text-base">权限配置</FormLabel>
                      <FormDescription>
                        按模块勾选权限点；模块标题复选框可全选/反选
                      </FormDescription>
                    </div>

                    <div className="max-h-[40vh] overflow-y-auto rounded-lg border p-1">
                      {isLoading ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          加载权限列表...
                        </div>
                      ) : error ? (
                        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                          权限列表加载失败，请稍后重试
                        </div>
                      ) : !permissionGroups || permissionGroups.length === 0 ? (
                        <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                          暂无权限点
                        </div>
                      ) : (
                        permissionGroups.map((group) => (
                          <ModulePermissionGroup
                            key={group.module}
                            group={group}
                            selectedCodes={selectedCodes}
                            onChange={field.onChange}
                          />
                        ))
                      )}
                    </div>
                    <FormMessage />
                  </FormItem>
                );
              }}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">启用状态</FormLabel>
                    <FormDescription>禁用后该角色的用户将无法登录或操作</FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                保存
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface TriStateCheckboxProps {
  checked: boolean | "indeterminate";
  onCheckedChange: (checked: boolean | "indeterminate") => void;
  disabled?: boolean;
}

/**
 * 三态复选框。
 *
 * 之所以不直接复用 `ui/checkbox.tsx`：shadcn 默认 Checkbox 在 indeterminate
 * 态仍渲染 CheckIcon，无法体现「部分选中」语义；按项目规范不得修改 `ui/` 源码，
 * 故此处直接基于 Radix Checkbox 原语渲染，并在 indeterminate 态切换为 MinusIcon。
 */
function TriStateCheckbox({ checked, onCheckedChange, disabled }: TriStateCheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      checked={checked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange(next as boolean | "indeterminate")}
      className={cn(
        "peer border-input dark:bg-input/30 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground data-[state=indeterminate]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive size-4 shrink-0 rounded-[4px] border shadow-xs transition-shadow outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {checked === "indeterminate" ? (
          <MinusIcon className="size-3.5" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

interface ModulePermissionGroupProps {
  group: PermissionModuleGroup;
  selectedCodes: string[];
  onChange: (next: string[]) => void;
}

/**
 * 单个模块的权限分组面板：标题行（三态全选复选框 + 模块名 + 计数）+ 折叠后的权限点列表。
 */
function ModulePermissionGroup({ group, selectedCodes, onChange }: ModulePermissionGroupProps) {
  const [isOpen, setIsOpen] = useState(true);
  const moduleCodes = group.permissions.map((p) => p.code);
  const selectedCount = moduleCodes.filter((c) => selectedCodes.includes(c)).length;
  const totalCount = moduleCodes.length;

  const triState: boolean | "indeterminate" =
    selectedCount === 0
      ? false
      : selectedCount === totalCount
        ? true
        : "indeterminate";

  const handleToggleAll = (next: boolean | "indeterminate") => {
    if (next === true) {
      // 全选：合并该模块所有权限码（去重）
      onChange(Array.from(new Set([...selectedCodes, ...moduleCodes])));
    } else {
      // 反选/取消：移除该模块所有权限码
      onChange(selectedCodes.filter((c) => !moduleCodes.includes(c)));
    }
  };

  const handleToggleOne = (code: string, checked: boolean | "indeterminate") => {
    const isSelected = selectedCodes.includes(code);
    if (checked && !isSelected) {
      onChange([...selectedCodes, code]);
    } else if (!checked && isSelected) {
      onChange(selectedCodes.filter((c) => c !== code));
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b last:border-b-0">
      <div className="flex items-center gap-2 px-2 py-2">
        <TriStateCheckbox
          checked={triState}
          onCheckedChange={handleToggleAll}
          aria-label={`全选 ${getModuleLabel(group.module)} 模块权限`}
        />
        <CollapsibleTrigger className="flex flex-1 items-center justify-between gap-2 rounded-md py-1 text-left text-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50">
          <span className="flex items-center gap-2">
            <span>{getModuleLabel(group.module)}</span>
            <Badge variant="secondary" className="text-xs font-normal">
              {selectedCount}/{totalCount}
            </Badge>
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="space-y-1 px-2 pb-3 pl-9">
          {group.permissions.map((perm) => (
            <PermissionItem
              key={perm.id}
              permission={perm}
              checked={selectedCodes.includes(perm.code)}
              onCheckedChange={(c) => handleToggleOne(perm.code, c)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface PermissionItemProps {
  permission: PermissionResponse;
  checked: boolean;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
}

function PermissionItem({ permission, checked, onCheckedChange }: PermissionItemProps) {
  return (
    <label className="flex cursor-pointer flex-row items-start gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} className="mt-0.5" />
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-normal leading-tight">{permission.name}</span>
          {permission.is_system && (
            <Badge variant="secondary" className="text-xs font-normal">
              系统
            </Badge>
          )}
        </div>
        {permission.description && (
          <p className="text-xs text-muted-foreground">{permission.description}</p>
        )}
      </div>
    </label>
  );
}
