"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction } from "@/lib/api-c/auth";
import type { ActionResult } from "@/lib/action-result";
import { extractErrorMessage } from "@/lib/action-result";

export default function CRegisterPage() {
  const [state, formAction, isPending] = useActionState(
    registerAction,
    { success: false, error: "" } as ActionResult<{ user: unknown }>
  );
  const [confirmError, setConfirmError] = useState("");

  function handleConfirmChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const password = (e.target.form?.elements.namedItem("password") as HTMLInputElement)?.value ?? "";
    if (value && value !== password) {
      setConfirmError("两次输入的密码不一致");
    } else {
      setConfirmError("");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirmPassword") as HTMLInputElement).value;
    if (password !== confirmPassword) {
      e.preventDefault();
      setConfirmError("两次输入的密码不一致");
    }
  }

  return (
    <section className="px-4 md:px-6 pt-8">
      <div className="max-w-md mx-auto">
        <form action={formAction} onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
            {state && !state.success && state.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-c-error text-sm">
                {extractErrorMessage(state.error, "注册失败")}
              </div>
            )}
            <div className="mb-4">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
                用户名 <span className="text-c-error">*</span>
              </label>
              <input
                type="text"
                name="username"
                placeholder="4-30位字母/数字/下划线"
                required
                minLength={4}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                className="w-full bg-c-surface border border-c-border-subtle rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/20 transition-all"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
                密码 <span className="text-c-error">*</span>
              </label>
              <input
                type="password"
                name="password"
                placeholder="至少8位，含大小写字母和数字"
                required
                minLength={8}
                className="w-full bg-c-surface border border-c-border-subtle rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/20 transition-all"
              />
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">
                确认密码 <span className="text-c-error">*</span>
              </label>
              <input
                type="password"
                name="confirmPassword"
                placeholder="请再次输入密码"
                required
                minLength={8}
                onChange={handleConfirmChange}
                className={`w-full bg-c-surface border rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/20 transition-all ${confirmError ? "border-c-error" : "border-c-border-subtle"}`}
              />
              {confirmError && (
                <p className="mt-1 text-c-error text-sm">{confirmError}</p>
              )}
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">昵称（选填）</label>
              <input
                type="text"
                name="nickname"
                placeholder="请输入昵称"
                maxLength={100}
                className="w-full bg-c-surface border border-c-border-subtle rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/20 transition-all"
              />
            </div>
            <div className="mb-8">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">手机号（选填）</label>
              <input
                type="tel"
                name="phone"
                placeholder="138 0000 0000"
                pattern="1[3-9]\d{9}"
                className="w-full bg-c-surface border border-c-border-subtle rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 focus:ring-c-trust-blue/20 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-c-trust-blue text-white h-12 rounded-lg font-bold active:opacity-80 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "注册中..." : "注 册"}
            </button>
          </div>
        </form>
        <div className="text-center mt-8">
          <p className="text-sm text-c-text-secondary">已有账号？</p>
          <Link href="/c/login" className="inline-flex items-center text-c-trust-blue font-bold gap-1 mt-2 hover:underline">
            前往登录
          </Link>
        </div>
      </div>
    </section>
  );
}
