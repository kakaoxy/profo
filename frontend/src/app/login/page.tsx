"use client";

import { useActionState, useEffect } from "react";
import { loginAction, changePasswordAction } from "./actions"; // 引入两个 Action
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner"; // 引入 toast

export default function LoginPage() {
  // 登录表单状态
  const [loginState, loginFormAction, isLoginPending] = useActionState(
    loginAction,
    null
  );

  // 修改密码表单状态
  const [changeState, changeFormAction, isChangePending] = useActionState(
    changePasswordAction,
    null
  );

  // 监听修改密码成功的情况
  useEffect(() => {
    // 如果是在修改密码流程中，且没有 error，且也没有 mustChangePassword (说明成功退出了该状态)
    // 但这里的逻辑稍显复杂，我们简单点：
    // changeAction 如果返回空 error，说明成功。
    if (changeState && !changeState.error && !changeState.mustChangePassword) {
      toast.success("密码修改成功，请使用新密码登录");
      // 刷新页面重置状态
      window.location.reload();
    }
  }, [changeState]);

  // 判断当前显示哪个模式
  const isChangePasswordMode =
    loginState?.mustChangePassword || changeState?.mustChangePassword;
  const currentUsername = loginState?.username || changeState?.username || "";
  const tempToken = loginState?.tempToken || "";

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-100">
      <Card className="w-full max-w-sm">
        {/* --- 模式 A: 修改密码 --- */}
        {isChangePasswordMode ? (
          <>
            <CardHeader>
              <CardTitle className="text-xl text-orange-600">
                需修改初始密码
              </CardTitle>
              <CardDescription>
                为了账号安全，首次登录请设置新密码。
              </CardDescription>
            </CardHeader>
            <form action={changeFormAction}>
              <CardContent className="grid gap-4">
                {/* 隐藏字段：传递用户名和可能的临时Token */}
                <input type="hidden" name="username" value={currentUsername} />
                <input type="hidden" name="temp_token" value={tempToken} />

                <div className="grid gap-2">
                  <Label htmlFor="current_password">当前密码 (初始密码)</Label>
                  <Input
                    id="current_password"
                    name="current_password"
                    type="password"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new_password">新密码</Label>
                  <Input
                    id="new_password"
                    name="new_password"
                    type="password"
                    placeholder="至少8位字符"
                    required
                  />
                </div>
                {changeState?.error && (
                  <div className="text-sm text-red-500 font-medium">
                    {changeState.error}
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button
                  className="w-full"
                  type="submit"
                  disabled={isChangePending}
                >
                  {isChangePending ? "提交中..." : "确认修改"}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full"
                  type="button"
                  onClick={() => window.location.reload()}
                >
                  返回登录
                </Button>
              </CardFooter>
            </form>
          </>
        ) : (
          /* --- 模式 B: 正常登录 (保持不变) --- */
          <>
            <CardHeader>
              <CardTitle className="text-2xl">系统登录</CardTitle>
              <CardDescription>请输入您的管理员账号</CardDescription>
            </CardHeader>
            <form action={loginFormAction}>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="username">用户名</Label>
                  {/* 注意：actions.ts 已经改成了取 username，所以这里 name="username" */}
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    placeholder="admin"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">密码</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    required
                  />
                </div>
                {loginState?.error && (
                  <div className="text-sm text-red-500 font-medium">
                    {loginState.error}
                  </div>
                )}
              </CardContent>
              <CardFooter className="mt-4">
                <Button
                  className="w-full"
                  type="submit"
                  disabled={isLoginPending}
                >
                  {isLoginPending ? "登录中..." : "立即登录"}
                </Button>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
