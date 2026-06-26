"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { registerAction } from "@/lib/api-c/auth";
import type { ActionResult } from "@/lib/action-result";
import { extractErrorMessage } from "@/lib/action-result";
import {
  User,
  UserRound,
  Smartphone,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Verified,
  BarChart3,
} from "lucide-react";

export default function CRegisterPage() {
  const [state, formAction, isPending] = useActionState(
    registerAction,
    { success: false, error: "" } as ActionResult<{ user: unknown }>
  );
  const [confirmError, setConfirmError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function handleConfirmChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    const password =
      (e.target.form?.elements.namedItem("password") as HTMLInputElement)
        ?.value ?? "";
    if (value && value !== password) {
      setConfirmError("两次输入的密码不一致");
    } else {
      setConfirmError("");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;
    const confirmPassword = (
      form.elements.namedItem("confirmPassword") as HTMLInputElement
    ).value;
    if (password !== confirmPassword) {
      e.preventDefault();
      setConfirmError("两次输入的密码不一致");
    }
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Left Panel - Desktop Only */}
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 bg-white relative overflow-hidden items-center justify-center p-6">
        {/* Warm radial glow (per DESIGN.md hero only) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(251,225,209,0.6) 0%, transparent 60%)",
          }}
        />

        {/* Branding Content */}
        <div className="relative z-10 max-w-lg text-left">
          <div className="mb-8">
            <span className="text-ink text-[40px] leading-[48px] font-medium tracking-[-0.009em]">
              Profo
            </span>
          </div>
          <h1 className="font-display text-[44px] leading-[1.1] text-ink mb-4">
            开启您的专业地产之旅
          </h1>
          <p className="text-[18px] leading-[28px] text-ash">
            加入 Profo
            平台，体验前所未有的精准房产估价与高效房源管理。我们为每一位专业人士和业主提供最权威的数据支持。
          </p>

          {/* Feature Cards */}
          <div className="mt-16 grid grid-cols-2 gap-4">
            <div className="p-5 bg-white rounded-cards shadow-steep-sm">
              <Verified className="text-rust mb-2" size={24} />
              <div className="text-[14px] leading-[20px] font-medium text-ink">
                权威数据
              </div>
              <div className="text-[14px] leading-[20px] text-graphite mt-1">
                覆盖全国核心城市房产数据
              </div>
            </div>
            <div className="p-5 bg-white rounded-cards shadow-steep-sm">
              <BarChart3 className="text-rust mb-2" size={24} />
              <div className="text-[14px] leading-[20px] font-medium text-ink">
                智能估值
              </div>
              <div className="text-[14px] leading-[20px] text-graphite mt-1">
                基于AI的动态市场定价引擎
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Form Area */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 pt-16 md:p-6 md:pt-6 bg-fog md:bg-white">
        <div className="w-full max-w-[440px]">
          {/* Header */}
          <div className="mb-8 text-center md:text-left">
            <div className="md:hidden mb-4">
              <span className="text-ink text-[28px] leading-[34px] font-medium tracking-[-0.009em]">
                Profo
              </span>
            </div>
            <h2 className="text-[28px] leading-[34px] font-medium text-ink mb-2">
              创建新账号
            </h2>
            <p className="text-[16px] leading-[24px] text-ash">
              请填写以下信息完成注册
            </p>
          </div>

          {/* Form */}
          <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
            {/* Server Error */}
            {state && !state.success && state.error && (
              <div
                role="alert"
                className="p-3 bg-error-container border border-(--error)/30 rounded-inputs text-error text-sm"
              >
                {extractErrorMessage(state.error, "注册失败")}
              </div>
            )}

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ash" htmlFor="username">
                用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" size={20} />
                <input
                  id="username"
                  type="text"
                  name="username"
                  placeholder="请输入您的用户名"
                  required
                  minLength={4}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                  className="w-full pl-10 pr-4 py-3 rounded-inputs border border-dove/30 bg-white focus:border-rust focus:outline-none transition-all text-base text-ink placeholder:text-graphite"
                />
              </div>
            </div>

            {/* Nickname */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ash" htmlFor="nickname">
                昵称（选填）
              </label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" size={20} />
                <input
                  id="nickname"
                  type="text"
                  name="nickname"
                  placeholder="请输入昵称"
                  maxLength={100}
                  className="w-full pl-10 pr-4 py-3 rounded-inputs border border-dove/30 bg-white focus:border-rust focus:outline-none transition-all text-base text-ink placeholder:text-graphite"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ash" htmlFor="phone">
                手机号码
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" size={20} />
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  placeholder="请输入11位手机号（选填）"
                  pattern="1[3-9]\d{9}"
                  className="w-full pl-10 pr-4 py-3 rounded-inputs border border-dove/30 bg-white focus:border-rust focus:outline-none transition-all text-base text-ink placeholder:text-graphite"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ash" htmlFor="password">
                设置密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" size={20} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="至少8位字符"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-12 py-3 rounded-inputs border border-dove/30 bg-white focus:border-rust focus:outline-none transition-all text-base text-ink placeholder:text-graphite"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-graphite hover:text-ink transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-ash" htmlFor="confirmPassword">
                确认密码
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" size={20} />
                <input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  placeholder="请再次输入密码"
                  required
                  minLength={8}
                  onChange={handleConfirmChange}
                  className={`w-full pl-10 pr-4 py-3 rounded-inputs border bg-white focus:border-rust focus:outline-none transition-all text-base text-ink placeholder:text-graphite ${confirmError ? "border-c-error" : "border-dove/30"}`}
                />
              </div>
              {confirmError && (
                <p className="text-c-error text-sm">{confirmError}</p>
              )}
            </div>

            {/* Terms Checkbox */}
            <div className="flex items-start gap-3 py-2">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                className="mt-1 w-4 h-4 text-ink border-dove/30 rounded focus:ring-0"
              />
              <label
                className="text-sm text-ash leading-tight"
                htmlFor="terms"
              >
                注册即代表您已阅读并同意 Profo 的{" "}
                <Link href="#" className="text-rust font-medium hover:underline">
                  服务条款
                </Link>{" "}
                和{" "}
                <Link href="#" className="text-rust font-medium hover:underline">
                  隐私政策
                </Link>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-ink text-white font-medium text-[15px] py-3 rounded-full hover:opacity-90 active:scale-[0.98] transition-all tracking-[-0.009em] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "注册中..." : "立即注册"}
            </button>
          </form>

          {/* Footer Link */}
          <div className="mt-8 text-center">
            <p className="text-[16px] text-ash">
              已有账号？{" "}
              <Link
                href="/login"
                className="text-ink font-medium hover:underline transition-all"
              >
                立即登录
              </Link>
            </p>
          </div>
        </div>

        {/* Bottom Footer */}
        <div className="mt-auto pt-8 flex flex-wrap justify-center gap-4">
          <Link
            href="#"
            className="text-[12px] leading-[16px] font-medium text-graphite hover:text-ink uppercase"
          >
            关于我们
          </Link>
          <span className="text-[12px] leading-[16px] font-medium text-graphite opacity-40 uppercase">
            © 2024 Profo Real Estate
          </span>
        </div>
      </div>
    </div>
  );
}
