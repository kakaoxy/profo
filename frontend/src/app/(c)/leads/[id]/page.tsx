"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import useSWR from "swr";
import { LeadInfoCard } from "@/components/c/lead/LeadInfoCard";
import { SystemEstimateCard, notifyContactFailure } from "@/components/c/lead/SystemEstimateCard";
import { FollowUpList } from "@/components/c/lead/FollowUpList";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { ShieldAlert } from "lucide-react";
import { fetcher, ForbiddenError } from "@/lib/swr";
import { safeParseDate } from "@/lib/validators";
import { getFileUrl, getThumbnailUrl } from "@/lib/config";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";

type LeadDetail = components["schemas"]["PublicLeadDetail"];

function ForbiddenState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-ash">
      <ShieldAlert className="mb-4 h-12 w-12 text-ink/50" aria-hidden="true" />
      <p className="text-[18px] font-medium text-ink">{cLocale.leads.forbiddenTitle}</p>
      <p className="mt-1 text-[14px] text-graphite">{cLocale.leads.forbiddenDesc}</p>
      <Link
        href="/my"
        className="mt-4 inline-flex rounded-full bg-ink px-6 py-2.5 text-[15px] font-medium tracking-[-0.009em] text-white transition-colors hover:bg-ink/90"
      >
        {cLocale.leads.backToMine}
      </Link>
    </div>
  );
}

export default function LeadDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, error, isLoading, mutate } = useSWR<LeadDetail>(
    id ? `/api/v1/public/leads/${id}` : null,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 space-y-5">
        <Skeleton className="h-40 rounded-cards" />
        <Skeleton className="h-32 rounded-cards" />
        <Skeleton className="h-48 rounded-cards" />
      </div>
    );
  }

  if (error) {
    if (error instanceof ForbiddenError) {
      return <ForbiddenState />;
    }
    return <ErrorState onRetry={() => mutate()} />;
  }

  if (!data) {
    return <ErrorState onRetry={() => mutate()} />;
  }

  const formattedDate =
    safeParseDate(data.created_at)?.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) ?? "-";

  /**
   * 联系评估人：拉真实号 → tel: → 上报留痕。
   *
   * 顺序刻意如此（SPEC K9）：**先拨号、后异步上报**。tel: 可能被系统拦下或用户取消，
   * 上报失败也不能阻断拨号 —— 绝不因为记不上日志而让人打不出电话。
   */
  const handleContactEvaluator = async () => {
    try {
      // 用统一 fetcher（而非裸 fetch）：它会处理 401 → 静默续期 → 重试。
      // 裸 fetch 在会话过期时直接失败，客户点「拨打电话」只得到一句"获取联系方式失败"，
      // 与本项目「401 自动刷新链路不能断」的约束相违。
      const contact = await fetcher<{ phone: string; nickname: string }>(
        `/api/v1/public/leads/${id}/evaluator-contact`,
      );
      if (!contact?.phone) {
        notifyContactFailure();
        return;
      }

      // 异步留痕：失败静默（不影响拨号结果）
      void (async () => {
        try {
          const res = await fetch(`/api/v1/public/leads/${id}/follow-ups`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            // keepalive 必需：下方 window.location.href 会触发文档导航（真机调起拨号盘），
            // 导航后未声明 keepalive 的在途请求会被浏览器中止 —— 实测后端处理 >100ms 时
            // 留痕全部丢失（服务端记录“连接已断”）；加 keepalive 后 1500ms 也能送达。
            keepalive: true,
            body: JSON.stringify({
              method: "phone",
              content: `客户致电评估人 ${contact.nickname || ""}`.trim(),
            }),
          });
          if (res.ok) mutate();
        } catch {
          /* 留痕失败静默：拨号已发出，不打扰用户 */
        }
      })();

      // 拨号（Web 端用 tel: 协议；失败不抛错）
      window.location.href = `tel:${contact.phone}`;
    } catch {
      notifyContactFailure();
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-8 pb-24 md:pb-12">
      {/* Page heading */}
      <h1 className="text-[26px] font-medium leading-[1.18] tracking-[-0.23px] text-ink mb-8 md:mb-12">
        估价详情
      </h1>

      <div className="space-y-5">
        <LeadInfoCard
          communityName={data.community_name}
          layout={data.layout ?? null}
          area={data.area ?? null}
          floorInfo={data.floor_info ?? null}
          orientation={data.orientation ?? null}
          remarks={data.remarks ?? null}
          createdAt={formattedDate}
        />

        {data.images && data.images.length > 0 && (
          <div className="rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30">
            <h2 className="text-[18px] font-medium leading-[1.35] tracking-[-0.16px] text-ink mb-4">
              {cLocale.leads.floorPlanTitle}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.images.map((img, idx) => {
                const thumb = data.image_thumbnails?.[idx];
                const displayUrl = getThumbnailUrl(thumb, img);
                return (
                  <a
                    key={`${img}-${idx}`}
                    href={getFileUrl(img)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square relative rounded-inputs overflow-hidden border border-dove/30 bg-fog group"
                  >
                    <Image
                      src={displayUrl}
                      alt={`${cLocale.leads.floorPlanTitle} ${idx + 1}`}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 50vw, 33vw"
                      unoptimized
                    />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        <SystemEstimateCard
          evalPrice={data.eval_price ?? null}
          conditionScore={data.condition_score ?? null}
          expectedSaleDays={data.expected_sale_days ?? null}
          evaluator={data.evaluator ?? null}
          createdAt={formattedDate}
          onContactEvaluator={handleContactEvaluator}
        />

        <FollowUpList followUps={data.follow_ups ?? []} />
      </div>
    </div>
  );
}
