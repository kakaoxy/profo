"use client";

/**
 * 资金账户模块密码弹窗（首次设置 / 重设）.
 *
 * 与设计稿屏 0「去设密码」和页头「改密码」共用：`mode="change"` 时要求填写原密码。
 * 密码只存加密结果（后端 Argon2），前端不落任何持久化。
 */

import * as React from "react";
import { AlertTriangle, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setModulePassword } from "../actions";

interface PasswordDialogProps {
  open: boolean;
  /** change = 已设过密码，需填原密码；setup = 首次设置 */
  mode: "setup" | "change";
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function PasswordDialog({ open, mode, onOpenChange, onSuccess }: PasswordDialogProps) {
  const [oldPassword, setOldPassword] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  /**
   * 表单级错误（服务端返回：原密码不正确 / 限流 429 / 权限不足 / 网络异常）.
   *
   * ⚠️ 为什么必须与字段错误分开（2026-10-22 缺陷修复）：
   * 此前任何失败都写进 ``errors.password``，于是「请求过于频繁」这类**与输入内容无关**
   * 的错误被渲染在「新密码」输入框下方，并因 ``aria-invalid`` 把该输入框描成红框——
   * 用户看到的是「密码填错了」，实际却什么都没填错；长文案还会把两列栅格撑歪。
   * 现在服务端错误一律走本字段，渲染在表单底部，不再牵连任何输入框。
   */
  const [formError, setFormError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setOldPassword("");
    setPassword("");
    setConfirm("");
    setErrors({});
    setFormError("");
  }, [open]);

  const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const handleSubmit = async () => {
    const next: Record<string, string> = {};
    if (mode === "change" && oldPassword.length !== 6) next.oldPassword = "请输入当前模块密码";
    if (password.length !== 6) next.password = "密码需为 6 位数字";
    if (new Set(password).size === 1) next.password = "不要使用 6 位相同数字";
    if (confirm !== password) next.confirm = "两次输入不一致";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError("");
    setSubmitting(true);
    const res = await setModulePassword(password, mode === "change" ? oldPassword : undefined);
    setSubmitting(false);
    if (!res.success) {
      // 服务端错误不是字段格式问题 → 只走表单级提示（不再标红「新密码」）。
      // 429 的文案由后端给出「每小时最多 N 次」的可行动信息，见 error_handlers。
      setFormError(res.error);
      return;
    }
    toast.success("密码设好了");
    onOpenChange(false);
    onSuccess?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-105 rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.009em] text-ink">
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {mode === "change" ? "改密码" : "设密码"}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-graphite">
            这个密码只管资金账户，和登录密码分开。同事共用一把。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {mode === "change" ? (
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                原密码 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="••••••"
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(onlyDigits(e.target.value));
                  setFormError("");
                }}
                aria-invalid={Boolean(errors.oldPassword)}
              />
              {errors.oldPassword ? (
                <span className="text-[11px] text-destructive">{errors.oldPassword}</span>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                新密码 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="6 位数字"
                value={password}
                onChange={(e) => {
                  setPassword(onlyDigits(e.target.value));
                  setFormError("");
                }}
                aria-invalid={Boolean(errors.password)}
              />
              {errors.password ? (
                <span className="text-[11px] text-destructive">{errors.password}</span>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                再输一遍 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="6 位数字"
                value={confirm}
                onChange={(e) => {
                  setConfirm(onlyDigits(e.target.value));
                  setFormError("");
                }}
                aria-invalid={Boolean(errors.confirm)}
              />
              {errors.confirm ? (
                <span className="text-[11px] text-destructive">{errors.confirm}</span>
              ) : null}
            </div>
          </div>

          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-[12.5px] leading-relaxed text-destructive"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          <p className="rounded-2xl bg-fog px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
            输错 5 次锁 15 分钟。密码只管进门，能不能改还看权限。
          </p>
        </div>

        <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
          <span className="text-[12px] text-graphite">密码只存加密结果，查不到明文。</span>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              className="rounded-full bg-ink text-white hover:bg-ink/90"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "change" ? "保存" : "设好"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
