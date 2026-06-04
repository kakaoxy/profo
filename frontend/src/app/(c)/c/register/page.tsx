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
      <div className="hidden md:flex md:w-1/2 lg:w-3/5 bg-c-trust-blue relative overflow-hidden items-center justify-center p-6">
        {/* Decorative Circles */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full border border-white/20" />
          <div className="absolute bottom-[-5%] left-[-5%] w-[300px] h-[300px] rounded-full border border-white/20" />
        </div>

        {/* Branding Content */}
        <div className="relative z-10 max-w-lg text-left">
          <div className="mb-8">
            <span className="text-white text-[40px] leading-[48px] font-bold tracking-tighter">
              Profo
            </span>
          </div>
          <h1 className="text-[40px] leading-[48px] font-bold tracking-tight text-white mb-4">
            开启您的专业地产之旅
          </h1>
          <p className="text-[18px] leading-[28px] text-white opacity-80">
            加入 Profo
            平台，体验前所未有的精准房产估价与高效房源管理。我们为每一位专业人士和业主提供最权威的数据支持。
          </p>

          {/* Feature Cards */}
          <div className="mt-16 grid grid-cols-2 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <Verified className="text-c-action-gold mb-2" size={24} />
              <div className="text-[12px] leading-[16px] font-bold text-white uppercase">
                权威数据
              </div>
              <div className="text-[14px] leading-[20px] text-white opacity-60">
                覆盖全国核心城市房产数据
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <BarChart3 className="text-c-action-gold mb-2" size={24} />
              <div className="text-[12px] leading-[16px] font-bold text-white uppercase">
                智能估值
              </div>
              <div className="text-[14px] leading-[20px] text-white opacity-60">
                基于AI的动态市场定价引擎
              </div>
            </div>
          </div>
        </div>

        {/* Background Image Overlay */}
        <div className="absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="w-full h-full object-cover opacity-10 mix-blend-overlay"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB7dzcUxAm9SFTQ6y2YHQ6XwXWjB-dZ9UWRP5ZzN42xQMqzSicHk3sAUAVGLxIsQUoKKBI9sRhhbYxKaukmxHA1FG8ePcviE2xiEdMvBwR39-9_tguHiyRq-szvDEI3BzKd7cX9Jb0zyht7YkL4U7JsnjbWpJ2lhu9StyQwuYTmWR3U--_ke8HX2Ru_He4dj1n5dMNANymVkjnFHopqb3HRnXG3GHkG6cLg5lH3yfrDQjdTyHPlpHOTavms5U5CY-QSKohODAvbY28"
            alt=""
          />
        </div>
      </div>

      {/* Right Panel - Form Area */}
      <div className="flex-1 flex flex-col justify-center items-center p-4 pt-16 md:p-6 md:pt-6 bg-c-surface md:bg-white">
        <div className="w-full max-w-[440px]">
          {/* Header */}
          <div className="mb-8 text-center md:text-left">
            <div className="md:hidden mb-4">
              <span className="text-c-trust-blue text-[28px] leading-[34px] font-bold tracking-tighter">
                Profo
              </span>
            </div>
            <h2 className="text-[28px] leading-[34px] font-semibold text-c-text-primary mb-2">
              创建新账号
            </h2>
            <p className="text-[16px] leading-[24px] text-c-text-secondary">
              请填写以下信息完成注册
            </p>
          </div>

          {/* Form */}
          <form action={formAction} onSubmit={handleSubmit} className="space-y-4">
            {/* Server Error */}
            {state && !state.success && state.error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-c-error text-sm">
                {extractErrorMessage(state.error, "注册失败")}
              </div>
            )}

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-c-text-secondary" htmlFor="username">
                用户名
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary" size={20} />
                <input
                  id="username"
                  type="text"
                  name="username"
                  placeholder="请输入您的用户名"
                  required
                  minLength={4}
                  maxLength={30}
                  pattern="[a-zA-Z0-9_]+"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-c-border-subtle focus:border-c-trust-blue focus:ring-0 transition-all text-base text-c-text-primary placeholder:text-c-text-secondary outline-none"
                />
              </div>
            </div>

            {/* Nickname */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-c-text-secondary" htmlFor="nickname">
                昵称（选填）
              </label>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary" size={20} />
                <input
                  id="nickname"
                  type="text"
                  name="nickname"
                  placeholder="请输入昵称"
                  maxLength={100}
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-c-border-subtle focus:border-c-trust-blue focus:ring-0 transition-all text-base text-c-text-primary placeholder:text-c-text-secondary outline-none"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-c-text-secondary" htmlFor="phone">
                手机号码
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary" size={20} />
                <input
                  id="phone"
                  type="tel"
                  name="phone"
                  placeholder="请输入11位手机号"
                  pattern="1[3-9]\d{9}"
                  className="w-full pl-10 pr-4 py-3 rounded-lg border border-c-border-subtle focus:border-c-trust-blue focus:ring-0 transition-all text-base text-c-text-primary placeholder:text-c-text-secondary outline-none"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-c-text-secondary" htmlFor="password">
                设置密码
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary" size={20} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="至少8位字符"
                  required
                  minLength={8}
                  className="w-full pl-10 pr-12 py-3 rounded-lg border border-c-border-subtle focus:border-c-trust-blue focus:ring-0 transition-all text-base text-c-text-primary placeholder:text-c-text-secondary outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-c-text-secondary hover:text-c-trust-blue transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-c-text-secondary" htmlFor="confirmPassword">
                确认密码
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 text-c-text-secondary" size={20} />
                <input
                  id="confirmPassword"
                  type="password"
                  name="confirmPassword"
                  placeholder="请再次输入密码"
                  required
                  minLength={8}
                  onChange={handleConfirmChange}
                  className={`w-full pl-10 pr-4 py-3 rounded-lg border focus:border-c-trust-blue focus:ring-0 transition-all text-base text-c-text-primary placeholder:text-c-text-secondary outline-none ${confirmError ? "border-c-error" : "border-c-border-subtle"}`}
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
                className="mt-1 w-4 h-4 text-c-trust-blue border-c-border-subtle rounded focus:ring-0"
              />
              <label
                className="text-sm text-c-text-secondary leading-tight"
                htmlFor="terms"
              >
                注册即代表您已阅读并同意 Profo 的{" "}
                <Link href="#" className="text-c-trust-blue font-semibold hover:underline">
                  服务条款
                </Link>{" "}
                和{" "}
                <Link href="#" className="text-c-trust-blue font-semibold hover:underline">
                  隐私政策
                </Link>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-c-trust-blue text-white font-bold text-xs py-4 rounded-lg hover:bg-opacity-90 active:scale-[0.98] transition-all uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "注册中..." : "立即注册"}
            </button>
          </form>

          {/* Footer Link */}
          <div className="mt-8 text-center">
            <p className="text-[16px] text-c-text-secondary">
              已有账号？{" "}
              <Link
                href="/c/login"
                className="text-c-trust-blue font-bold hover:underline transition-all"
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
            className="text-[12px] leading-[16px] font-bold text-c-text-secondary hover:text-c-trust-blue uppercase"
          >
            关于我们
          </Link>
          <span className="text-[12px] leading-[16px] font-bold text-c-text-secondary opacity-40 uppercase">
            © 2024 Profo Real Estate
          </span>
        </div>
      </div>
    </div>
  );
}
