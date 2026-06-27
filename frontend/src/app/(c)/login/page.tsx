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
import { cLocale } from "@/lib/i18n/c-locale";

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
    <div className="md:p-0 md:min-h-dvh md:flex md:items-center md:justify-center relative">
      {/* Main Card */}
      <main className="w-full max-w-md mx-auto md:max-w-5xl bg-white rounded-cards overflow-hidden shadow-steep flex flex-col md:flex-row md:min-h-[600px]">
        {/* Left Panel - Brand (Desktop Only) */}
        <section className="relative hidden md:flex md:w-1/2 bg-white overflow-hidden">
          {/* Warm radial glow (per DESIGN.md hero only) */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 20%, rgba(251,225,209,0.6) 0%, transparent 60%)",
            }}
          />
          {/* Brand Content */}
          <div className="relative z-10 flex flex-col justify-end p-12 w-full h-full">
            <div className="mb-8">
              <h1 className="text-[44px] leading-[1.1] font-medium text-ink mb-3 tracking-[-0.009em]">
                {cLocale.common.brand.company}
              </h1>
              <p className="text-[18px] leading-[28px] text-ash max-w-sm">
                {cLocale.login.brandDesc}
              </p>
            </div>
            <div className="flex gap-4 text-graphite">
              <div className="flex items-center gap-2">
                <Verified size={20} />
                <span className="text-[12px] leading-[16px] font-medium uppercase tracking-wider">
                  {cLocale.login.badgeInstitutional}
                </span>
              </div>
              <div className="flex items-center gap-2 border-l border-dove/30 pl-4">
                <ShieldCheck size={20} />
                <span className="text-[12px] leading-[16px] font-medium uppercase tracking-wider">
                  {cLocale.login.badgeSecure}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Right Panel - Login Form */}
        <section className="flex-1 p-6 md:p-12 flex flex-col justify-center bg-white">
          {/* Mobile Brand Logo */}
          <div className="md:hidden mb-8 text-center">
            <span className="text-[28px] leading-[34px] font-medium text-ink">
              {cLocale.common.brand.company}
            </span>
          </div>

          {/* Header */}
          <header className="mb-8">
            <h2 className="text-[28px] leading-[34px] font-medium text-ink mb-2">
              {cLocale.login.welcomeTitle}
            </h2>
            <p className="text-[16px] leading-[24px] text-ash">
              {cLocale.login.welcomeSubtitle}
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
              if (!username.trim()) errors.username = cLocale.login.validation.usernameRequired;
              if (!password) errors.password = cLocale.login.validation.passwordRequired;
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
              <div
                role="alert"
                className="p-3 bg-error-container border border-(--error)/30 rounded-inputs text-error text-sm"
              >
                {state.error}
              </div>
            )}

            <input type="hidden" name="redirect" value={redirect} />

            {/* Username Input */}
            <div className="space-y-2">
              <label
                className="text-[14px] leading-[20px] text-ash"
                htmlFor="username"
              >
                {cLocale.login.usernameLabel}
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="username"
                  name="username"
                  placeholder={cLocale.login.usernamePlaceholder}
                  required
                  aria-invalid={!!validationErrors.username}
                  className={`peer w-full pl-10 pr-4 py-3 bg-white border rounded-inputs focus:outline-none transition-all text-[16px] leading-[24px] text-ink placeholder:text-graphite ${validationErrors.username ? "border-c-error focus:border-c-error" : "border-dove/30 focus:border-rust"}`}
                  onChange={() =>
                    setValidationErrors((prev) => ({
                      ...prev,
                      username: undefined,
                    }))
                  }
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite/50 peer-focus:text-ink transition-colors pointer-events-none" size={20} />
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
                  className="text-[14px] leading-[20px] text-ash"
                  htmlFor="password"
                >
                  {cLocale.login.passwordLabel}
                </label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  placeholder={cLocale.login.passwordPlaceholder}
                  required
                  aria-invalid={!!validationErrors.password}
                  className={`peer w-full pl-10 pr-12 py-3 bg-white border rounded-inputs focus:outline-none transition-all text-[16px] leading-[24px] text-ink placeholder:text-graphite ${validationErrors.password ? "border-c-error focus:border-c-error" : "border-dove/30 focus:border-rust"}`}
                  onChange={() =>
                    setValidationErrors((prev) => ({
                      ...prev,
                      password: undefined,
                    }))
                  }
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite/50 peer-focus:text-ink transition-colors pointer-events-none" size={20} />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? cLocale.login.hidePassword : cLocale.login.showPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-graphite/50 hover:text-ink transition-colors"
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
                className="w-4 h-4 rounded border-dove/30 text-ink focus:ring-0"
                id="remember"
                name="remember"
                type="checkbox"
              />
              <label
                className="text-[14px] leading-[20px] text-ash select-none"
                htmlFor="remember"
              >
                {cLocale.login.remember}
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full px-5 py-3 bg-ink text-white rounded-full text-[15px] font-medium tracking-[-0.009em] hover:opacity-90 active:scale-[0.98] transition-all flex justify-center items-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>{cLocale.login.submitting}</span>
                </>
              ) : (
                <>
                  <span>{cLocale.login.submit}</span>
                  <ArrowRight
                    size={18}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <footer className="mt-8 border-t border-dove/30 pt-4 text-center">
            <p className="text-[14px] leading-[20px] text-ash">
              {cLocale.login.noAccount}{" "}
              <Link
                className="text-[15px] font-medium text-ink hover:underline ml-1"
                href="/register"
              >
                {cLocale.login.registerLink}
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
