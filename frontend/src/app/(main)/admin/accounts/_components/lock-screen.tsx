"use client";

/**
 * 资金账户入口锁屏（设计稿屏 0）与守卫.
 *
 * 安全边界说明（SPEC §4.5）：这一层只负责**观感与倒计时**；真正的令牌校验在
 * 后端 `require_accounts_unlock` 依赖里。故即使有人绕过本组件渲染，也拿不到数据。
 *
 * 口径（SPEC D2）：密码错 5 次锁 15 分钟；锁定期内正确密码也拒绝。
 */

import * as React from "react";
import { AlertTriangle, Clock, Info, KeyRound, Loader2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { PasswordDialog } from "./password-dialog";
import { useModuleLock } from "./module-lock-context";

const MAX_ATTEMPTS = 5;

function LockCard() {
  const { hasPassword, attemptsLeft, retryAfterSeconds, unlock, refresh } = useModuleLock();
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [shake, setShake] = React.useState(false);
  const [pwdDialog, setPwdDialog] = React.useState<"setup" | "change" | null>(null);

  const locked = (retryAfterSeconds ?? 0) > 0;

  const handleSubmit = async () => {
    if (locked) return;
    if (password.length !== 6) {
      setError("请输入 6 位数字密码");
      return;
    }
    setSubmitting(true);
    const ok = await unlock(password);
    setSubmitting(false);
    if (!ok) {
      setError("密码不正确");
      setPassword("");
      setShake(true);
      window.setTimeout(() => setShake(false), 340);
      void refresh();
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-8">
      <div
        className={cn(
          "w-full max-w-[420px] rounded-cards bg-white px-8 py-9 shadow-steep transition-shadow",
          shake && "ring-2 ring-destructive/40",
        )}
      >
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-[14px] bg-apricot-wash text-rust">
          {locked ? (
            <Lock className="h-5 w-5" aria-hidden="true" />
          ) : (
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          )}
        </div>

        <p className="text-[12px] font-medium tracking-[0.06em] text-graphite">财务 · 需密码</p>
        <h1 className="mt-1 font-display text-[32px] leading-tight tracking-[-0.015em] text-ink">
          资金账户
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-graphite">
          {locked
            ? `密码输错太多次，请 ${Math.ceil((retryAfterSeconds ?? 0) / 60)} 分钟后再试。`
            : hasPassword
              ? "这里有钱。输密码才能看。"
              : "还没设密码。先设 6 位数字。"}
        </p>

        {!hasPassword ? (
          <>
            <div className="mt-5 flex items-start gap-2 rounded-2xl bg-apricot-wash px-4 py-3 text-[12.5px] leading-relaxed text-rust">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>还没设密码。先设 6 位数字。</span>
            </div>
            <Button
              className="mt-5 w-full rounded-full bg-ink py-3 text-white hover:bg-ink/90"
              onClick={() => setPwdDialog("setup")}
            >
              <KeyRound className="h-4 w-4" />
              去设密码
            </Button>
            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-graphite">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              密码只存加密结果，谁都查不到明文。
            </p>
          </>
        ) : (
          <>
            <div className="mt-5 grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">
                  密码 <span className="text-destructive">*</span>
                </Label>
                <span className="text-[11.5px] text-dove">6 位数字</span>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-fog px-4 py-2.5">
                <Lock className="h-4 w-4 shrink-0 text-graphite" aria-hidden="true" />
                <input
                  type={show ? "text" : "password"}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  placeholder="••••••"
                  value={password}
                  disabled={locked}
                  autoFocus
                  onChange={(e) => {
                    setPassword(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSubmit();
                  }}
                  className="min-w-0 flex-1 bg-transparent text-[14px] tabular-nums text-ink outline-none placeholder:text-dove"
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  className="text-[11.5px] text-graphite hover:text-ink"
                  aria-label={show ? "隐藏密码" : "显示密码"}
                >
                  {show ? "隐藏" : "显示"}
                </button>
              </div>
              {error ? (
                <span className="flex items-center gap-1 text-[11.5px] text-destructive">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {error}
                </span>
              ) : null}
            </div>

            <Button
              className="mt-4 w-full rounded-full bg-ink py-3 text-white hover:bg-ink/90"
              onClick={handleSubmit}
              disabled={locked || submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              进去
            </Button>

            <div className="mt-3 flex items-center justify-between text-[11.5px] text-graphite">
              <span className="flex items-center gap-1.5">
                剩余尝试
                <span className="flex items-center gap-1" aria-hidden="true">
                  {Array.from({ length: MAX_ATTEMPTS }).map((_, index) => (
                    <i
                      key={index}
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        index >= attemptsLeft ? "bg-dove/40" : "bg-rust",
                      )}
                    />
                  ))}
                </span>
                <span className="tabular-nums">{Math.min(attemptsLeft, MAX_ATTEMPTS)}</span>
              </span>
              <button
                type="button"
                className="text-graphite underline-offset-2 hover:text-ink hover:underline"
                onClick={() => setPwdDialog("change")}
              >
                忘了？
              </button>
            </div>

            <div className="mt-5 grid gap-1.5 border-t border-dove/25 pt-4 text-[12px] text-graphite">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                进去后 30 分钟没操作，自动上锁。
              </span>
              <span className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                输错 5 次锁 15 分钟。
              </span>
            </div>
          </>
        )}
      </div>

      <PasswordDialog
        open={pwdDialog !== null}
        mode={pwdDialog ?? "change"}
        onOpenChange={(next) => {
          if (!next) setPwdDialog(null);
        }}
        onSuccess={() => {
          setPwdDialog(null);
          void refresh();
        }}
      />
    </div>
  );
}

/**
 * 模块守卫：未解锁时渲染锁屏并阻止子页面发请求.
 *
 * 子页面（总览/详情/流水）都是客户端组件，靠 `useModuleLock().token` 拉数据，
 * 因此锁屏期间不会产生任何业务请求。
 */
export function AccountLockGuard({ children }: { children: React.ReactNode }) {
  const { unlocked, checking } = useModuleLock();

  if (checking) {
    return (
      <PageContainer>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-graphite" aria-label="加载中" />
        </div>
      </PageContainer>
    );
  }

  if (!unlocked) {
    return (
      <PageContainer>
        <LockCard />
      </PageContainer>
    );
  }

  return <>{children}</>;
}
