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
import { useSession, useAuth } from "@/lib/auth/client";
import { cLocale } from "@/lib/i18n/c-locale";

function maskPhone(phone: string): string {
  if (phone.length >= 7) {
    return phone.slice(0, 3) + "****" + phone.slice(-4);
  }
  return phone;
}

export default function CProfilePage() {
  const nicknameRef = useRef<HTMLInputElement>(null);
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const session = useSession();
  const { fetchSession } = useAuth();
  const userInfo = {
    nickname: session.status === "authenticated" ? session.user.nickname : null,
    phone: session.status === "authenticated" ? session.user.phone : null,
  };

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
      toast.success(profileState.message || cLocale.profile.updateSuccess);
      // 同步刷新 AuthProvider 中的 session.user，避免 UI 显示旧昵称
      void fetchSession();
    }
  }, [profileState, fetchSession]);

  useEffect(() => {
    if (phoneState.success && phoneState.data) {
      requestAnimationFrame(() => {
        setPhoneDialogOpen(false);
      });
      toast.success(phoneState.message || cLocale.profile.phoneUpdateSuccess);
      void fetchSession();
    }
  }, [phoneState, fetchSession]);

  const displayNickname =
    profileState.success && profileState.data?.nickname
      ? profileState.data.nickname
      : userInfo.nickname || cLocale.common.user.defaultName;

  const displayPhone =
    phoneState.success && phoneState.data?.phone
      ? phoneState.data.phone
      : userInfo.phone || "";

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 space-y-6">
      <div className="flex justify-center pt-6">
        <UserAvatar name={displayNickname} size="lg" />
      </div>

      <section className="rounded-cards bg-white p-5 md:p-6 shadow-steep">
        <form action={profileAction} className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-ink">
              {cLocale.profile.nicknameLabel}
            </label>
            <button
              type="submit"
              disabled={isProfilePending}
              className="text-sm font-medium text-ink hover:underline disabled:opacity-50"
            >
              {isProfilePending ? cLocale.common.action.saving : cLocale.common.action.save}
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
            placeholder={cLocale.profile.nicknamePlaceholder}
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
              <p className="text-sm font-medium text-ink">{cLocale.profile.phoneLabel}</p>
              <p className="text-sm text-graphite">
                {displayPhone ? maskPhone(displayPhone) : cLocale.common.user.phoneUnbound}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPhoneDialogOpen(true)}
            className="text-sm font-medium text-ink hover:underline"
          >
            {cLocale.profile.phoneModify}
          </button>
        </div>
      </section>

      <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{cLocale.profile.dialogTitle}</DialogTitle>
            <DialogDescription>
              {cLocale.profile.dialogDesc}
            </DialogDescription>
          </DialogHeader>
          <form action={phoneAction} className="space-y-4">
            {phoneState && !phoneState.success && phoneState.error && (
              <p className="text-xs text-c-error">{phoneState.error}</p>
            )}
            <div>
              <label className="block text-xs font-medium text-graphite uppercase mb-2">
                {cLocale.profile.newPhoneLabel}
              </label>
              <input
                type="tel"
                name="phone"
                placeholder={cLocale.profile.newPhonePlaceholder}
                required
                className="w-full bg-white border border-dove/30 rounded-inputs px-4 py-3 text-base text-ink placeholder:text-graphite focus:outline-none focus:border-rust transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-graphite uppercase mb-2">
                {cLocale.profile.currentPasswordLabel}
              </label>
              <input
                type="password"
                name="password"
                placeholder={cLocale.profile.currentPasswordPlaceholder}
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
                {isPhonePending ? cLocale.common.action.submitting : cLocale.common.action.submit}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
