"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { LogOut, Pencil } from "lucide-react";
import { UserAvatar } from "@/components/c/shared/UserAvatar";
import { LeadListItem } from "@/components/c/lead/LeadListItem";
import { logoutAction } from "@/lib/api-c/auth";
import { getUserInfoFromCookie } from "@/lib/api-c/user-info";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/c/shared/EmptyState";
import { ErrorState } from "@/components/c/shared/ErrorState";

interface LeadItem {
  id: string | number;
  community_name: string;
  layout: string | null;
  area: number | null;
  status: string;
  status_display: string;
  status_color: string;
  created_at: string;
}

interface LeadListResponse {
  items: LeadItem[];
  total: number;
}

async function fetchWithAuth<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" });
  if (response.status === 401) {
    throw new Error("AUTH_REQUIRED");
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }
  return response.json();
}

export default function CMyPage() {
  const router = useRouter();
  const userInfo = useMemo(() => getUserInfoFromCookie(), []);

  const displayName = userInfo.nickname || "用户";
  const displayPhone = userInfo.phone || "未设置手机号";

  const { data, error, isLoading, mutate } = useSWR<LeadListResponse>(
    "/api/v1/public/leads/mine",
    fetchWithAuth
  );

  useEffect(() => {
    if (error?.message === "AUTH_REQUIRED") {
      router.replace("/c/login?redirect=/c/my");
    }
  }, [error, router]);

  const handleLogout = async () => {
    await logoutAction();
  };

  return (
    <div className="px-4 md:px-6 space-y-6">
      <section className="flex items-center gap-4 rounded-xl bg-white p-4 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle">
        <UserAvatar name={displayName} size="lg" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-c-text-primary">{displayName}</h2>
          <p className="text-sm text-c-text-secondary">{displayPhone}</p>
        </div>
        <Link
          href="/c/profile"
          className="flex items-center gap-1 text-sm font-medium text-c-trust-blue hover:underline"
        >
          <Pencil className="h-3.5 w-3.5" />
          编辑资料
        </Link>
      </section>

      <section>
        <h3 className="text-base font-bold text-c-text-primary mb-3">
          我的估价
        </h3>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton
                key={i}
                className="h-24 rounded-xl shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle"
              />
            ))}
          </div>
        ) : error ? (
          <ErrorState onRetry={() => mutate()} />
        ) : !data?.items.length ? (
          <EmptyState
            title="暂无估价记录"
            description="提交房源估价后，这里会显示您的估价记录"
          />
        ) : (
          <div className="space-y-3">
            {data.items.map((lead) => (
              <LeadListItem
                key={lead.id}
                id={String(lead.id)}
                communityName={lead.community_name}
                layout={lead.layout}
                area={lead.area}
                status={lead.status}
                statusDisplay={lead.status_display}
                statusColor={lead.status_color}
                createdAt={lead.created_at}
              />
            ))}
          </div>
        )}
      </section>

      <section className="pt-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 h-12 rounded-lg border border-c-border-subtle bg-white text-c-error font-medium hover:bg-red-50 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          退出登录
        </button>
      </section>
    </div>
  );
}
