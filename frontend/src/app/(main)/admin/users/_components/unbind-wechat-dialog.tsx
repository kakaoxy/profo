"use client";

import { logger } from "@/lib/logger";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { unbindUserWechatAction } from "../actions/index";
import type { UserResponse } from "../actions/index";

interface UnbindWechatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserResponse | null;
}

export function UnbindWechatDialog({ open, onOpenChange, user }: UnbindWechatDialogProps) {
  const [isPending, setIsPending] = useState(false);

  async function handleConfirm() {
    if (!user) return;

    setIsPending(true);
    try {
      const result = await unbindUserWechatAction(user.id);
      if (result.success) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        // 40904（未绑定/并发解绑）：toast 错误并关闭弹窗，列表已由 action revalidatePath 刷新
        if ((result as { code?: number }).code === 40904) {
          toast.error(result.message);
          onOpenChange(false);
        } else {
          toast.error(result.message);
        }
      }
    } catch (error) {
      logger.error(error);
      toast.error("操作失败");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认解绑微信账号？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                正在解绑用户 <b>{user?.nickname || user?.username}</b> 的微信账号
              </p>
              <div className="text-muted-foreground">
                <p>解绑后该用户将无法通过微信登录</p>
                <p>如该用户仅有微信一种登录方式，需重新注册或联系管理员</p>
                <p>操作不可撤销，将立即失效该用户的所有现有登录会话</p>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认解绑
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
