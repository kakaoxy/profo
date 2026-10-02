"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePermission } from "@/hooks/use-permission";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { TodoBoardConfigResponse, TodoBoardRulesData } from "../_lib/todo-board-config";
import { TodoRulesConfigBody } from "./todo-rules-config-body";

/** 与明细弹窗同族的投影（shadow-phone） */
const POPOVER_SHADOW =
  "shadow-[0_24px_48px_-12px_rgba(23,25,28,0.18),0_0_0_1px_rgba(23,25,28,0.06)]";

interface TodoRulesConfigPopupProps {
  /** RSC 首屏随看板一并取回的规则配置（null = 配置加载失败） */
  config: TodoBoardConfigResponse | null;
}

/**
 * 页头「规则配置」入口 + 配置弹窗（设计稿 ARTBOARD 01-A / 03-A）：
 * 桌面右侧锚定 Popover（400px）/ 移动端底部 Sheet 共用主体；
 * 仅管理员可编辑（usePermission roleCode），保存 = PUT 全量 → toast → router.refresh()
 * 让 RSC 重取看板与配置，规则快照时间随之走表。
 */
export function TodoRulesConfigPopup({ config }: TodoRulesConfigPopupProps) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { roleCode } = usePermission();
  const canEdit = roleCode === "admin";

  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async (payload: TodoBoardRulesData) => {
    setSaving(true);
    try {
      const { error } = await client.PUT("/api/v1/projects/todo-board/config", { body: payload });
      if (error) {
        toast.error("规则配置保存失败，请稍后重试");
        return;
      }
      setDirty(false);
      toast.success("规则配置已保存 · 下个规则快照生效");
      router.refresh();
    } catch {
      toast.error("规则配置保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const trigger = (
    <button
      type="button"
      title="规则配置"
      aria-label="规则配置"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-pure-white px-3.5 py-[7px] text-[12.5px] font-[450] tracking-[-0.009em] text-ink shadow-steep-sm transition-shadow hover:shadow-steep md:px-3.5",
        open && "bg-ink text-pure-white shadow-none",
      )}
    >
      <SlidersHorizontal className="h-3.5 w-3.5" />
      <span className="hidden md:inline">规则配置</span>
    </button>
  );

  const body =
    config === null ? (
      <div className="flex h-32 items-center justify-center px-6 text-center text-[13px] text-graphite">
        规则配置加载失败，请刷新页面重试。
      </div>
    ) : (
      <TodoRulesConfigBody
        key={`${config.updated_at ?? "none"}`}
        saved={config}
        defaults={config.defaults}
        canEdit={canEdit}
        saving={saving}
        dirty={dirty}
        onDirtyChange={setDirty}
        onSave={handleSave}
        onClose={() => setOpen(false)}
      />
    );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className={cn(
            "w-full gap-0 rounded-t-[20px] p-0",
            "max-h-[85vh] overflow-y-auto",
            "data-[state=closed]:animate-none!",
          )}
        >
          {body}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={24}
        className={cn(
          /* 小屏笔记本（如 768px 高）内容自然高度约 740px 会超出视口：max-h 约束 +
             flex-col 让主体阈值区内部滚动（body 根 flex-1），页脚保存按钮常驻可见 */
          "flex w-[400px] flex-col overflow-hidden rounded-[20px] border-none p-0",
          "max-h-[calc(100dvh-10rem)]",
          "data-[state=closed]:animate-none!",
          POPOVER_SHADOW,
        )}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}
