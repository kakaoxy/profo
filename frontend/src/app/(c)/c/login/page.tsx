"use client";

import { Suspense, startTransition, useActionState, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/lib/api-c/auth";
import type { ActionResult } from "@/lib/action-result";

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

  return (
    <section className="px-4 md:px-6 pt-8">
      <div className="max-w-md mx-auto">
        <form
          className="space-y-6"
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
        >
          <div className="bg-white rounded-xl p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
            {state && !state.success && state.error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-c-error text-sm">
                {state.error}
              </div>
            )}
            <input type="hidden" name="redirect" value={redirect} />
            <div className="mb-6">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">用户名</label>
              <input
                type="text"
                name="username"
                placeholder="请输入用户名"
                required
                aria-invalid={!!validationErrors.username}
                className={`w-full bg-c-surface border rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 transition-all ${validationErrors.username ? "border-c-error focus:ring-c-error/20" : "border-c-border-subtle focus:ring-c-trust-blue/20"}`}
                onChange={() =>
                  setValidationErrors((prev) => ({ ...prev, username: undefined }))
                }
              />
              {validationErrors.username && (
                <div className="mt-1.5 text-sm text-c-error font-medium">
                  {validationErrors.username}
                </div>
              )}
            </div>
            <div className="mb-8">
              <label className="block text-xs font-bold text-c-text-secondary uppercase mb-2">密码</label>
              <input
                type="password"
                name="password"
                placeholder="请输入密码"
                required
                aria-invalid={!!validationErrors.password}
                className={`w-full bg-c-surface border rounded-lg px-4 py-3 text-base text-c-text-primary placeholder:text-c-text-secondary focus:outline-none focus:ring-2 transition-all ${validationErrors.password ? "border-c-error focus:ring-c-error/20" : "border-c-border-subtle focus:ring-c-trust-blue/20"}`}
                onChange={() =>
                  setValidationErrors((prev) => ({ ...prev, password: undefined }))
                }
              />
              {validationErrors.password && (
                <div className="mt-1.5 text-sm text-c-error font-medium">
                  {validationErrors.password}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-c-trust-blue text-white h-12 rounded-lg font-bold active:opacity-80 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "登录中..." : "登 录"}
            </button>
          </div>
        </form>
        <div className="text-center mt-8">
          <p className="text-sm text-c-text-secondary">还没有账号？</p>
          <Link href="/c/register" className="inline-flex items-center text-c-trust-blue font-bold gap-1 mt-2 hover:underline">
            前往注册
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function CLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
