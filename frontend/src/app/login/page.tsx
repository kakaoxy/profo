"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
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

export default function LoginPage() {
  // state 存放服务端返回的结果（比如报错信息），formAction 是提交表单的函数
  // null 是初始状态
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-100">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">系统登录</CardTitle>
          <CardDescription>
            请输入您的管理员账号
          </CardDescription>
        </CardHeader>
        
        {/* 这里的 action={formAction} 会自动触发服务端的 loginAction */}
        <form action={formAction}>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="username">用户名</Label>
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
            {/* 如果有错误，显示在这里 */}
            {state?.error && (
              <div className="text-sm text-red-500 font-medium">
                {state.error}
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button className="w-full" type="submit" disabled={isPending}>
              {isPending ? "登录中..." : "立即登录"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}