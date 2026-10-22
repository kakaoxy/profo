"use client";

/**
 * 资金账户模块锁上下文（客户端）.
 *
 * 设计要点（SPEC §4.5 / §6 屏 0）：
 * - 解锁令牌存 `sessionStorage`：关闭标签页即失效，比长期 cookie 更严；令牌本身只
 *   由后端签发与校验，前端只负责携带与倒计时。
 * - 倒计时以服务端 `seconds_left` 为准，每次受保护请求成功后用新的 `seconds_left`
 *   重置本地计时（令牌是 30 分钟**滑动**过期）。
 * - 无有效令牌时展示锁屏（`AccountLockGuard`），锁屏内可解锁 / 首次设置密码。
 */

import * as React from "react";
import { toast } from "sonner";
import { fetchLockState, lockAccounts, unlockAccounts } from "../actions";
import { FUND_ACCOUNTS_UNLOCK_TOKEN_KEY } from "@/lib/constants";

const TOKEN_STORAGE_KEY = FUND_ACCOUNTS_UNLOCK_TOKEN_KEY;

export interface ModuleLockState {
  /** 是否已设置模块密码 */
  hasPassword: boolean;
  /** 是否已解锁（本地有令牌，服务端已确认有效） */
  unlocked: boolean;
  /** 令牌剩余秒数（0 表示未解锁） */
  secondsLeft: number;
  /** 剩余尝试次数（密码错误时递减） */
  attemptsLeft: number;
  /** 锁定剩余秒数（非空表示处于 15 分钟锁定期） */
  retryAfterSeconds: number | null;
  /** 是否正在校验令牌（首屏 loading） */
  checking: boolean;
}

interface ModuleLockContextValue extends ModuleLockState {
  /** 当前解锁令牌（未解锁时为 null） */
  token: string | null;
  /** 状态刷新（进入页面 / 请求被拒后调用） */
  refresh: () => Promise<void>;
  /** 用密码解锁 */
  unlock: (password: string) => Promise<boolean>;
  /** 手动锁定 */
  lock: () => Promise<void>;
  /** 令牌被服务端判定失效（401/403）时静默重新校验 */
  invalidate: () => void;
  /** 用服务端返回的剩余秒数重置倒计时 */
  touch: (secondsLeft: number) => void;
}

/**
 * 解锁令牌滑动有效期（秒）——与后端 `services/finance/unlock.py::UNLOCK_TTL_SECONDS` 对齐。
 *
 * ⚠️ 为何客户端也要这个常量（2026-10-22 缺陷修复）：服务端 `require_accounts_unlock`
 * 对**每个受保护请求**都会 ``EXPIRE`` 重置为 30 分钟（滑动过期），但本地倒计时此前
 * 只会单向递减、从不续期——结果是用户连续操作 31 分钟仍会被前端判定过期并清掉令牌，
 * 与「30 分钟**没操作**才锁」的口径直接矛盾（且 `touch` 定义了却无人调用）。
 * 现在每个受保护请求成功后调 ``touch(SLIDING_TTL_SECONDS)`` 重置本地倒计时。
 */
export const SLIDING_TTL_SECONDS = 30 * 60;

const ModuleLockContext = React.createContext<ModuleLockContextValue | null>(null);

function readStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // 隐私模式下 sessionStorage 可能抛错：退化为「本次页面有效」的内存态
    return null;
  }
}

function writeStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 忽略存储异常（隐私模式），令牌仍在内存中可用
  }
}

export function ModuleLockProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = React.useState<string | null>(null);
  const [state, setState] = React.useState<ModuleLockState>({
    hasPassword: true,
    unlocked: false,
    secondsLeft: 0,
    attemptsLeft: 5,
    retryAfterSeconds: null,
    checking: true,
  });

  const refresh = React.useCallback(async () => {
    const current = readStoredToken();
    const res = await fetchLockState({ token: current });
    if (!res.success) {
      setState((prev) => ({ ...prev, checking: false, unlocked: false, secondsLeft: 0 }));
      return;
    }
    const data = res.data;
    if (!data.unlocked) writeStoredToken(null);
    setToken(data.unlocked ? current : null);
    setState({
      hasPassword: data.has_password,
      unlocked: data.unlocked,
      secondsLeft: data.seconds_left ?? 0,
      attemptsLeft: data.attempts_left ?? 5,
      retryAfterSeconds: data.retry_after_seconds ?? null,
      checking: false,
    });
  }, []);

  // 首屏校验一次（令牌可能已过期或被手动锁定）
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  // 本地倒计时：每秒递减，归零即视为锁定（服务端仍会二次校验）
  React.useEffect(() => {
    if (!state.unlocked) return;
    const timer = setInterval(() => {
      setState((prev) => {
        if (!prev.unlocked) return prev;
        if (prev.secondsLeft <= 1) {
          writeStoredToken(null);
          setToken(null);
          return { ...prev, unlocked: false, secondsLeft: 0 };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.unlocked]);

  // 锁定期倒计时（15 分钟）
  React.useEffect(() => {
    const retry = state.retryAfterSeconds;
    if (!retry || retry <= 0) return;
    const timer = setInterval(() => {
      setState((prev) => {
        const next = (prev.retryAfterSeconds ?? 0) - 1;
        if (next <= 0) {
          // 倒计时归零：清空 retryAfterSeconds（两个原分支相同，F-5 合并死 if）
          return { ...prev, retryAfterSeconds: null };
        }
        return { ...prev, retryAfterSeconds: next };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.retryAfterSeconds]);

  const unlock = React.useCallback(async (password: string) => {
    const res = await unlockAccounts(password);
    if (!res.success) {
      toast.error(res.error);
      // 失败后同步服务端真实剩余次数与锁定状态（口径以服务端为准）
      void refresh();
      return false;
    }
    const data = res.data;
    if (data.token) {
      writeStoredToken(data.token);
      setToken(data.token);
    }
    setState({
      hasPassword: true,
      unlocked: true,
      secondsLeft: data.seconds_left ?? 0,
      attemptsLeft: data.attempts_left ?? 5,
      retryAfterSeconds: data.retry_after_seconds ?? null,
      checking: false,
    });
    toast.success("已进入 · 30 分钟没操作会自动锁");
    return true;
  }, [refresh]);

  const lock = React.useCallback(async () => {
    const current = readStoredToken();
    await lockAccounts(current);
    writeStoredToken(null);
    setToken(null);
    setState((prev) => ({ ...prev, unlocked: false, secondsLeft: 0 }));
    toast.success("已锁定");
  }, []);

  const invalidate = React.useCallback(() => {
    writeStoredToken(null);
    setToken(null);
    setState((prev) => ({ ...prev, unlocked: false, secondsLeft: 0 }));
  }, []);

  const touch = React.useCallback((secondsLeft: number) => {
    setState((prev) => (prev.unlocked ? { ...prev, secondsLeft } : prev));
  }, []);

  const value = React.useMemo<ModuleLockContextValue>(
    () => ({ ...state, token, refresh, unlock, lock, invalidate, touch }),
    [state, token, refresh, unlock, lock, invalidate, touch],
  );

  return <ModuleLockContext.Provider value={value}>{children}</ModuleLockContext.Provider>;
}

export function useModuleLock(): ModuleLockContextValue {
  const ctx = React.useContext(ModuleLockContext);
  if (!ctx) throw new Error("useModuleLock 必须在 ModuleLockProvider 内使用");
  return ctx;
}

/** 剩余秒数格式化为 m:ss（锁屏与页头倒计时共用） */
export function formatSeconds(total: number): string {
  const safe = Math.max(total, 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
