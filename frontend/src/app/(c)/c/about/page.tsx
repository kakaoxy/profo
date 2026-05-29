"use client";

import useSWR from "swr";
import {
  Home,
  TrendingUp,
  Clock,
  Users,
  HelpCircle,
  CheckCircle,
} from "lucide-react";
import { HeroCard } from "@/components/c/shared/HeroCard";
import { PainPointCard } from "@/components/c/shared/PainPointCard";
import { CTAButton } from "@/components/c/shared/CTAButton";
import { StatsCard } from "@/components/c/shared/StatsCard";
import { Skeleton } from "@/components/ui/skeleton";

interface PlatformStats {
  on_sale_count: number;
  current_month_sold: number;
}

const painPoints = [
  {
    icon: <Home className="h-5 w-5" />,
    title: "品相老化，第一眼被比下去",
    description: "老房子不收拾，客户进门就摇头",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "定价全凭感觉，进退两难",
    description: "挂高没人看，挂低怕吃亏",
  },
  {
    icon: <Clock className="h-5 w-5" />,
    title: "挂牌后带看越来越稀",
    description: "头两周热闹，后面一个月没一组",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "商圈动辄几百套在挂",
    description: "你的房子凭什么被选中？",
  },
  {
    icon: <HelpCircle className="h-5 w-5" />,
    title: "周期没谱，全看运气",
    description: "快则两三个月，慢则遥遥无期",
  },
];

const serviceFeatures = [
  "我们出资装修，让房子第一眼胜出",
  "约定兜底价，卖不到我们赔装修",
  "专业团队操盘，精准定价控节奏",
  "深谙中介激励，带看量始终在线",
  "400+套成交经验，周期可控",
  "卖超了归我们，卖不掉装修白送",
];

const processSteps = [
  {
    num: "①",
    title: "上门评估，约定兜底卖价",
    description: "专业评估团队上门，给出市场分析与兜底价承诺。",
  },
  {
    num: "②",
    title: "我们出资装修，旧房焕新",
    description:
      "快速翻新改造，让房子品相大幅提升，第一眼就打动买家。",
  },
  {
    num: "③",
    title: "精准营销 + 中介激励，加速成交",
    description:
      "多渠道推广 + 中介高佣金激励，带看量持续在线。卖不掉，装修白送。",
  },
];

export default function AboutPage() {
  const { data: statsData, isLoading } = useSWR<PlatformStats>(
    "/api/v1/public/stats/platform",
    (url: string) => fetch(url).then((r) => r.json())
  );

  return (
    <div className="mx-auto max-w-[600px] px-4 pt-8 pb-8">
      <div className="space-y-6">
        <HeroCard label="美房宝" title="卖房这件事，远比你想象的复杂">
          <p className="mt-4 text-sm text-white/70">你可能正在经历：</p>
          <div className="mt-4 space-y-3">
            {painPoints.map((point) => (
              <PainPointCard
                key={point.title}
                icon={point.icon}
                title={point.title}
                description={point.description}
              />
            ))}
          </div>
          <p className="mt-6 text-base font-semibold text-white">
            问题不在某一环，在于全流程
          </p>
          <p className="mt-2 text-base text-white/90">
            美房宝的做法不一样：我们把整件事接过来。
          </p>
        </HeroCard>

        <div className="rounded-2xl border border-c-border-subtle bg-white px-6 py-8">
          <h3 className="text-xl font-bold text-c-text-primary">我们的服务</h3>
          <ul className="mt-5 space-y-3">
            {serviceFeatures.map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-c-action-gold" />
                <span className="text-sm text-c-text-primary">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <HeroCard label="美房宝" title="你的房子，我们的全案操盘">
          <div className="mt-6 space-y-0">
            {processSteps.map((step, index) => (
              <div key={step.num} className="relative flex gap-4 pb-6 last:pb-0">
                {index < processSteps.length - 1 && (
                  <div className="absolute left-[15px] top-9 h-full w-px bg-white/20" />
                )}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-c-action-gold/20 text-sm font-bold text-c-action-gold">
                  {step.num}
                </span>
                <div>
                  <p className="font-semibold text-white">{step.title}</p>
                  <p className="mt-1 text-sm text-white/70">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </HeroCard>

        <div className="rounded-2xl border border-c-border-subtle bg-white px-6 py-8">
          <h3 className="mb-5 text-center text-xl font-bold text-c-text-primary">
            400+ 业主已选择我们
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {isLoading ? (
              <>
                <div className="flex flex-col items-center rounded-xl border border-c-border-subtle bg-white px-6 py-5">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </div>
                <div className="flex flex-col items-center rounded-xl border border-c-border-subtle bg-white px-6 py-5">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-2 h-3 w-16" />
                </div>
              </>
            ) : (
              <>
                <StatsCard
                  value={statsData?.on_sale_count ?? 0}
                  label="在售套数"
                  valueColor="text-c-status-onsale"
                />
                <StatsCard
                  value={statsData?.current_month_sold ?? 0}
                  label="本月已成交"
                  valueColor="text-c-trust-blue"
                />
              </>
            )}
          </div>
        </div>

        <HeroCard label="美房宝" title="你的房子，现在能卖多少？">
          <p className="mt-3 text-sm text-white/70">
            输入房源信息，立即获取专业估价
          </p>
          <div className="mt-6">
            <CTAButton href="/c/valuation">免费获取估价</CTAButton>
          </div>
          <p className="mt-4 text-center text-xs text-white/50">
            100% 隐私保密 · 专业精准评估
          </p>
        </HeroCard>
      </div>
    </div>
  );
}
