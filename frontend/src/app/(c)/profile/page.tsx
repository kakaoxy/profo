"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/c/shared/UserAvatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { updateProfileAction, updatePhoneAction } from "./actions";
import type { ActionResult } from "@/lib/action-result";
import { useUserInfo } from "@/lib/api-c/user-info";

function maskPhone(phone: string): string {
  if (phone.length >= 7) {
    return phone.slice(0, 3) + "****" + phone.slice(-4);
  }
  return phone;
}

export default function CProfilePage() {
  const nicknameRef = useRef<HTMLInputElement>(null);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const userInfo = useUserInfo();

  useEffect(() => {
    if (nicknameRef.current && userInfo.nickname) {
      nicknameRef.current.value = userInfo.nickname;
    }
  }, [userInfo.nickname]);

  const [profileState, profileAction, isProfilePending] = useActionState(
    updateProfileAction,
    { success: false, error: "" } as ActionResult<{ nickname: string }>
  );

  const [phoneState, phoneAction, isPhonePending] = useActionState(
    updatePhoneAction,
    { success: false, error: "" } as ActionResult<{ phone: string }>
  );

  useEffect(() => {
    if (profileState.success && profileState.data) {
      if (nicknameRef.current) {
        nicknameRef.current.value = profileState.data.nickname;
      }
      toast.success(profileState.message || "修改成功");
    }
  }, [profileState]);

  useEffect(() => {
    if (phoneState.success && phoneState.data) {
      requestAnimationFrame(() => {
        setPhoneDialogOpen(false);
      });
      toast.success(phoneState.message || "手机号修改成功");
    }
  }, [phoneState]);

  const displayNickname =
    profileState.success && profileState.data?.nickname
      ? profileState.data.nickname
      : userInfo.nickname || "用户";

  const displayPhone =
    phoneState.success && phoneState.data?.phone
      ? phoneState.data.phone
      : userInfo.phone || "";

  return (
    <div className="px-4 md:px-6 space-y-6">
      <div className="flex justify-center pt-6">
        <UserAvatar name={displayNickname} size="lg" />
      </div>

      <section className="rounded-cards bg-white p-5 md:p-6 shadow-steep">
        <form action={profileAction} className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">
              昵称
            </label>
            <button
              type="submit"
              disabled={isProfilePending}
              className="text-sm font-medium text-ink hover:underline disabled:opacity-50"
            >
              {isProfilePending ? "保存中..." : "保存"}
            </button>
          </div>
          {profileState && !profileState.success && profileState.error && (
            <p className="text-xs text-c-error">{profileState.error}</p>
          )}
          <input
            ref={nicknameRef}
            type="text"
            name="nickname"
            defaultValue={userInfo.nickname || ""}
            placeholder="请输入昵称"
            maxLength={100}
            className="w-full bg-white border border-dove/30 rounded-inputs px-4 py-3 text-base text-ink placeholder:text-graphite focus:outline-none focus:border-rust transition-all"
          />
        </form>
      </section>

      <section className="rounded-cards bg-white p-5 md:p-6 shadow-steep">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Phone className="h-5 w-5 text-graphite" />
            <div>
              <p className="text-sm font-medium text-ink">手机号</p>
              <p className="text-sm text-graphite">
                {displayPhone ? maskPhone(displayPhone) : "未绑定"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPhoneDialogOpen(true)}
            className="text-sm font-medium text-ink hover:underline"
          >
            修改
          </button>
        </div>
      </section>

      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改手机号</DialogTitle>
            <DialogDescription>
              请输入新手机号和当前密码以验证身份
            </DialogDescription>
          </DialogHeader>
          <form action={phoneAction} className="space-y-4">
            {phoneState && !phoneState.success && phoneState.error && (
              <p className="text-xs text-c-error">{phoneState.error}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-graphite uppercase mb-2">
                新手机号
              </label>
              <input
                type="tel"
                name="phone"
                placeholder="请输入新手机号"
                required
                className="w-full bg-white border border-dove/30 rounded-inputs px-4 py-3 text-base text-ink placeholder:text-graphite focus:outline-none focus:border-rust transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-graphite uppercase mb-2">
                当前密码
              </label>
              <input
                type="password"
                name="password"
                placeholder="请输入当前密码"
                required
                className="w-full bg-white border border-dove/30 rounded-inputs px-4 py-3 text-base text-ink placeholder:text-graphite focus:outline-none focus:border-rust transition-all"
              />
            </div>
            <DialogFooter>
              <button
                type="submit"
                disabled={isPhonePending}
                className="w-full bg-ink text-white rounded-full px-5 py-3 text-[15px] font-medium tracking-[-0.009em] hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPhonePending ? "提交中..." : "确认修改"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
