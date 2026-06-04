"use client";

import { Suspense, startTransition, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/lib/api-c/auth";
import type { ActionResult } from "@/lib/action-result";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Verified,
  ShieldCheck,
  Loader2,
} from "lucide-react";

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "";

  const [state, formAction, isPending] = useActionState(
    loginAction,
    { success: false, error: "" } as ActionResult<null>
  );

  const [validationErrors, setValidationErrors] = useState<{
    username?: string;
    password?: string;
  }>({});

  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="px-4 pt-8 md:p-0 md:min-h-dvh md:flex md:items-center md:justify-center relative">
      {/* Background Decoration - Desktop Only */}
      <div className="hidden md:block fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#dae2fd]/20 blur-[120px] rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#e9c349]/10 blur-[100px] rounded-full -translate-x-1/2 translate-y-1/2" />
      </div>

      {/* Main Card */}
      <main className="w-full max-w-md mx-auto md:max-w-5xl bg-white rounded-xl overflow-hidden shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle md:border-0 flex flex-col md:flex-row md:min-h-[600px]">
        {/* Left Panel - Brand Imagery (Desktop Only) */}
        <section className="relative hidden md:flex md:w-1/2 bg-c-trust-blue overflow-hidden group">
          {/* Gradient Overlay */}
          <div className="absolute inset-0 z-10 bg-gradient-to-t from-c-trust-blue/80 via-transparent to-transparent" />
          {/* Background Image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Luxury Modern Architecture"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB-roUM_zjXFnzSBGoHYSGn6cGZxfJCLsULVUyPfhf0PBCPJkDVbQSJFyPzPUbDtF6XJn1AtDjyof2Djp2jxqToSn8K3RYx4kpXSWmADKr5-nfUrpuGGf8iY1bJXsusim9fQRzGMTWFT4vbvw48-peIgb95Ag1j-5ubvMXnjQDRrtogQO0GtnE4cOlG3VGmhoITretwQboOi-DOkwW9If1mbMtZTSrRdQoMVhhNHEbKMQJtP1_atrg7pL0hUCDBwLtUoJRuhKoL6a4"
          />
          {/* Brand Content */}
          <div className="relative z-20 flex flex-col justify-end p-12 w-full h-full">
            <div className="mb-8">
              <h1 className="text-[40px] leading-[48px] font-bold tracking-[-0.02em] text-white mb-2">
                Profo
              </h1>
              <p className="text-[18px] leading-[28px] text-white/80 max-w-sm">
                权威、精准、宁静。为您开启高端地产的卓越管理之旅。
              </p>
            </div>
            <div className="flex gap-4 text-white/60">
              <div className="flex items-center gap-2">
                <Verified size={20} />
                <span className="text-[12px] leading-[16px] font-bold uppercase tracking-[0.05em]">
                  Institutional Grade
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-white/20 pl-4">
                <ShieldCheck size={20} />
                <span className="text-[12px] leading-[16px] font-bold uppercase tracking-[0.05em]">
                  Secure Access
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel - Login Form */}
        <section className="flex-1 p-6 md:p-16 flex flex-col justify-center bg-white">
          {/* Mobile Brand Logo */}
          <div className="md:hidden mb-8 text-center">
            <span className="text-[28px] leading-[34px] font-bold text-c-trust-blue">
              Profo
            </span>
          </div>

          {/* Header */}
          <header className="mb-8">
            <h2 className="text-[28px] leading-[34px] font-semibold text-c-text-primary mb-2">
              欢迎回来
            </h2>
            <p className="text-[16px] leading-[24px] text-c-text-secondary">
              请输入您的凭据以访问您的账户
            </p>
          </header>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const username = formData.get("username") as string;
              const password = formData.get("password") as string;
              const errors: { username?: string; password?: string } = {};
              if (!username.trim()) errors.username = "请输入用户名";
              if (!password) errors.password = "请输入密码";
              if (Object.keys(errors).length > 0) {
                setValidationErrors(errors);
                return;
              }
              setValidationErrors({});
              startTransition(() => {
                formAction(formData);
              });
            }}
            className="space-y-4"
          >
            {/* Server Error */}
            {state && !state.success && state.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-c-error text-sm">
                {state.error}
              </div>
            )}

            <input type="hidden" name="redirect" value={redirect} />

            {/* Username Input */}
            <div className="space-y-2">
              <label
                className="text-[14px] leading-[20px] text-c-text-secondary"
                htmlFor="username"
              >
                用户名 / 电子邮箱
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  name="username"
                  placeholder="请输入用户名"
                  required
                  aria-invalid={!!validationErrors.username}
                  className={`peer w-full pl-10 pr-4 py-3 bg-transparent border rounded-lg focus:outline-none focus:ring-2 transition-all text-[16px] leading-[24px] text-c-text-primary placeholder:text-c-text-secondary ${validationErrors.username ? "border-c-error focus:ring-c-error/20" : "border-c-border-subtle focus:ring-c-trust-blue/10 focus:border-c-trust-blue"}`}
                  onChange={() =>
                    setValidationErrors((prev) => ({
                      ...prev,
                      username: undefined,
                    }))
                  }
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary/50 peer-focus:text-c-trust-blue transition-colors pointer-events-none" size={20} />
              </div>
              {validationErrors.username && (
                <div className="text-sm text-c-error font-medium">
                  {validationErrors.username}
                </div>
              )}
            </div>

            {/* Password Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label
                  className="text-[14px] leading-[20px] text-c-text-secondary"
                  htmlFor="password"
                >
                  密码
                </label>
                <Link
                  className="text-[12px] leading-[16px] font-bold text-c-trust-blue hover:underline tracking-[0.05em] uppercase"
                  href="#"
                >
                  忘记密码?
                </Link>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  placeholder="请输入密码"
                  required
                  aria-invalid={!!validationErrors.password}
                  className={`peer w-full pl-10 pr-12 py-3 bg-transparent border rounded-lg focus:outline-none focus:ring-2 transition-all text-[16px] leading-[24px] text-c-text-primary placeholder:text-c-text-secondary ${validationErrors.password ? "border-c-error focus:ring-c-error/20" : "border-c-border-subtle focus:ring-c-trust-blue/10 focus:border-c-trust-blue"}`}
                  onChange={() =>
                    setValidationErrors((prev) => ({
                      ...prev,
                      password: undefined,
                    }))
                  }
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary/50 peer-focus:text-c-trust-blue transition-colors pointer-events-none" size={20} />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-c-text-secondary/50 hover:text-c-trust-blue transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {validationErrors.password && (
                <div className="text-sm text-c-error font-medium">
                  {validationErrors.password}
                </div>
              )}
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2 py-2">
              <input
                className="w-4 h-4 rounded border-c-border-subtle text-c-trust-blue focus:ring-c-trust-blue"
                id="remember"
                type="checkbox"
              />
              <label
                className="text-[14px] leading-[20px] text-c-text-secondary select-none"
                htmlFor="remember"
              >
                保持登录状态
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full py-4 bg-c-trust-blue text-white rounded-lg text-[12px] leading-[16px] font-bold tracking-widest uppercase hover:bg-[#131b2e] active:scale-[0.98] transition-all flex justify-center items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>登录中...</span>
                </>
              ) : (
                <>
                  <span>登录</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <footer className="mt-8 border-t border-c-border-subtle pt-4 text-center">
            <p className="text-[14px] leading-[20px] text-c-text-secondary">
              还没有账户？{" "}
              <Link
                className="text-[12px] leading-[16px] font-bold text-c-trust-blue hover:underline ml-1 tracking-[0.05em] uppercase"
                href="/c/register"
              >
                立即注册
              </Link>
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}

export default function CLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
