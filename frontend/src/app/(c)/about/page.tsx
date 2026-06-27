"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Home,
  TrendingUp,
  Clock,
  Users,
  HelpCircle,
  CheckCircle,
  BadgeCheck,
  ImageIcon,
} from "lucide-react";
import { HeroCard } from "@/components/c/shared/HeroCard";
import { PainPointCard } from "@/components/c/shared/PainPointCard";
import { CTAButton } from "@/components/c/shared/CTAButton";
import { StatsCard } from "@/components/c/shared/StatsCard";
import { Skeleton } from "@/components/ui/skeleton";
import { publicFetcher } from "@/lib/swr";
import type { components } from "@/lib/api-types";
import Link from "next/link";

type PlatformStats = components["schemas"]["PublicPlatformStats"];

const painPoints = [
  {
    icon: <Home className="h-5 w-5" />,
    title: "品相老化，第一眼被比下去",
    description: "老房子不收拾，客户进门就摇头",
    color: "text-rust",
    label: "01 — 视觉资产贬值",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "定价全凭感觉，进退两难",
    description: "挂高没人看，挂低怕吃亏",
    color: "text-rust",
    label: "02 — 价格锚点缺失",
  },
  {
    icon: <Clock className="h-5 w-5" />,
    title: "挂牌后带看越来越稀",
    description: "头两周热闹，后面一个月没一组",
    color: "text-rust",
    label: "03 — 流动性陷阱",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "商圈动辄几百套在挂",
    description: "你的房子凭什么被选中？",
    color: "text-rust",
    label: "04 — 竞争红海",
  },
  {
    icon: <HelpCircle className="h-5 w-5" />,
    title: "周期没谱，全看运气",
    description: "快则两三个月，慢则遥遥无期",
    color: "text-rust",
    label: "05 — 时间成本失控",
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
    num: "01",
    title: "上门评估，约定兜底卖价",
    description: "专业评估团队上门，给出市场分析与兜底价承诺。",
  },
  {
    num: "02",
    title: "我们出资装修，旧房焕新",
    description:
      "快速翻新改造，让房子品相大幅提升，第一眼就打动买家。",
  },
  {
    num: "03",
    title: "精准营销 + 中介激励，加速成交",
    description:
      "多渠道推广 + 中介高佣金激励，带看量持续在线。卖不掉，装修白送。",
  },
];

// PC端专用大图标
const pcPainPointIcons = [
  <Home key="h" className="h-9 w-9" />,
  <TrendingUp key="t" className="h-9 w-9" />,
  <Clock key="c" className="h-9 w-9" />,
  <Users key="u" className="h-9 w-9" />,
  <HelpCircle key="q" className="h-9 w-9" />,
];

export default function AboutPage() {
  const { data: statsData, isLoading } = useSWR<PlatformStats>(
    "/api/v1/public/stats/platform",
    publicFetcher
  );
  const [heroError, setHeroError] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);

  return (
    <>
      {/* ========== 移动端布局 ========== */}
      <div className="mx-auto max-w-[600px] px-4 pt-8 pb-8 md:hidden">
        <div className="space-y-6">
          <HeroCard label="美房宝" title="卖房这件事，远比你想象的复杂">
            <p className="mt-4 text-sm text-ash tracking-[-0.009em]">
              你可能正在经历：
            </p>
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
            <p className="mt-6 text-base font-medium text-ink tracking-[-0.009em]">
              问题不在某一环，在于全流程
            </p>
            <p className="mt-2 text-base text-ash tracking-[-0.009em]">
              美房宝的做法不一样：我们把整件事接过来。
            </p>
          </HeroCard>

          <div className="rounded-cards bg-white p-6 shadow-steep-sm">
            <h3 className="text-xl font-medium text-ink tracking-[-0.009em]">
              我们的服务
            </h3>
            <ul className="mt-5 space-y-3">
              {serviceFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-rust" />
                  <span className="text-sm text-ink tracking-[-0.009em]">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <HeroCard label="美房宝" title="你的房子，我们的全案操盘">
            <div className="mt-6 space-y-0">
              {processSteps.map((step, index) => (
                <div key={step.num} className="relative flex gap-4 pb-6 last:pb-0">
                  {index < processSteps.length - 1 && (
                    <div className="absolute left-[15px] top-9 h-full w-px bg-dove/30" />
                  )}
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-apricot-wash text-sm font-medium text-rust">
                    {step.num}
                  </span>
                  <div>
                    <p className="font-medium text-ink tracking-[-0.009em]">
                      {step.title}
                    </p>
                    <p className="mt-1 text-sm text-ash tracking-[-0.009em]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </HeroCard>

          <div className="rounded-cards bg-white p-6 shadow-steep-sm">
            <h3 className="mb-5 text-center text-xl font-medium text-ink tracking-[-0.009em]">
              400+ 业主已选择我们
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {isLoading ? (
                <>
                  <div className="flex flex-col items-center rounded-cards bg-fog px-6 py-5">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="mt-2 h-3 w-16" />
                  </div>
                  <div className="flex flex-col items-center rounded-cards bg-fog px-6 py-5">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="mt-2 h-3 w-16" />
                  </div>
                </>
              ) : (
                <>
                  <StatsCard
                    value={statsData?.on_sale_count ?? 0}
                    label="在售套数"
                  />
                  <StatsCard
                    value={statsData?.current_month_sold ?? 0}
                    label="本月已成交"
                  />
                </>
              )}
            </div>
          </div>

          <HeroCard label="美房宝" title="你的房子，现在能卖多少？">
            <p className="mt-3 text-sm text-ash tracking-[-0.009em]">
              输入房源信息，立即获取专业估价
            </p>
            <div className="mt-6">
              <CTAButton href="/valuation">免费获取估价</CTAButton>
            </div>
            <p className="mt-4 text-center text-xs text-graphite tracking-[-0.009em]">
              100% 隐私保密 · 专业精准评估
            </p>
          </HeroCard>
        </div>
      </div>

      {/* ========== PC端布局 ========== */}
      <div className="hidden md:block">
        {/* Hero Section */}
        <section className="relative flex min-h-[60vh] md:min-h-[640px] w-full items-center overflow-hidden bg-white py-20 md:py-24">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 30% 30%, rgba(251,225,209,0.6) 0%, transparent 60%)",
            }}
          />
          <div className="absolute inset-0 z-0">
            {heroError ? (
              <div className="flex h-full w-full items-center justify-center bg-fog">
                <ImageIcon className="h-16 w-16 text-dove/40" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Modern Luxury Interior"
                className="h-full w-full object-cover opacity-25"
                src="/about/hero-bg.png"
                fetchPriority="high"
                onError={() => setHeroError(true)}
              />
            )}
          </div>
          <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6">
            <div className="max-w-2xl">
              <h1 className="mb-4 font-display text-[44px] leading-[1.1] text-ink">
                专业赋能，
                <br />
                让每一套房产焕发应有价值
              </h1>
              <p className="mb-8 text-[18px] leading-normal text-ash tracking-[-0.009em]">
                美房宝
                致力于为业主提供全链路资产管理与交易优化服务，通过专业审美与数据驱动，解决房产流通中的一切痛点。
              </p>
              <div className="flex items-center gap-6">
                <Link
                  href="/valuation"
                  className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white tracking-[-0.009em] transition-all hover:opacity-90"
                >
                  开启专业操盘
                </Link>
                <a
                  href="#process"
                  className="text-[15px] font-medium text-ink tracking-[-0.009em] hover:underline"
                >
                  了解更多服务
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Pain Points Section */}
        <section className="bg-fog py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="mb-16 text-center">
              <span className="text-[12px] font-medium uppercase tracking-[0.2em] text-rust">
                Pain Points
              </span>
              <h2 className="mt-2 font-display text-[44px] leading-[1.1] text-ink">
                房东面临的真实挑战
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-8">
              {painPoints.map((point, index) => (
                <div
                  key={point.title}
                  className="flex h-80 flex-col justify-between rounded-cards bg-white p-8 shadow-steep-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-steep"
                >
                  <div>
                    <span className={`mb-4 block ${point.color}`}>
                      {pcPainPointIcons[index]}
                    </span>
                    <h3 className="mb-2 text-[20px] leading-[1.4] font-medium text-ink tracking-[-0.009em]">
                      {point.title}
                    </h3>
                    <p className="text-[14px] leading-normal text-ash tracking-[-0.009em]">
                      {point.description}
                    </p>
                  </div>
                  <div className="text-[12px] font-medium uppercase tracking-[0.2em] text-graphite">
                    {point.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section id="process" className="bg-white py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="mb-16 flex flex-col items-end justify-between gap-4 md:flex-row">
              <div className="max-w-xl">
                <span className="text-[12px] font-medium uppercase tracking-[0.2em] text-rust">
                  Our Methodology
                </span>
                <h2 className="mt-2 font-display text-[44px] leading-[1.1] text-ink">
                  美房宝 全案操盘三部曲
                </h2>
              </div>
              <p className="max-w-md text-[16px] leading-normal text-ash tracking-[-0.009em]">
                我们不仅仅是中介，更是您的房产产品经理。从诊断到成交，每一步都精益求精。
              </p>
            </div>
            <div className="flex gap-8">
              {processSteps.map((step) => (
                <div key={step.num} className="group flex-1">
                  <div className="relative z-10 h-full rounded-cards bg-white p-8 shadow-steep-sm">
                    <div className="mb-4 font-display text-6xl text-dove/40 transition-colors group-hover:text-rust">
                      {step.num}
                    </div>
                    <h4 className="mb-2 text-[20px] leading-[1.4] font-medium text-ink tracking-[-0.009em]">
                      {step.title}
                    </h4>
                    <p className="text-[14px] leading-normal text-ash tracking-[-0.009em]">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service Features Section */}
        <section className="bg-fog py-20">
          <div className="mx-auto max-w-[1200px] px-6">
            <div className="mb-16 text-center">
              <span className="text-[12px] font-medium uppercase tracking-[0.2em] text-rust">
                Our Services
              </span>
              <h2 className="mt-2 font-display text-[44px] leading-[1.1] text-ink">
                我们的服务保障
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {serviceFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 rounded-cards bg-white p-6 shadow-steep-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-steep"
                >
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-rust" />
                  <span className="text-[14px] leading-normal text-ink tracking-[-0.009em]">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Social Proof Section */}
        <section className="mx-auto max-w-[1200px] px-6 py-20">
          <div className="flex flex-col items-center gap-12 rounded-cards bg-ink p-8 text-white md:flex-row md:p-16">
            <div className="flex-1">
              <h2 className="mb-4 font-display text-[44px] leading-[1.1] text-white">
                业主信任的专业保障
              </h2>
              <p className="mb-8 text-[18px] leading-normal text-white/70 tracking-[-0.009em]">
                每一份数据的背后，都是我们对房产价值的极致追求与对房东托付的尊重。
              </p>
              <div className="grid grid-cols-2 gap-8">
                {isLoading ? (
                  <>
                    <div>
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="mt-1 h-4 w-16" />
                    </div>
                    <div>
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="mt-1 h-4 w-16" />
                    </div>
                    <div>
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="mt-1 h-4 w-16" />
                    </div>
                    <div>
                      <Skeleton className="h-10 w-24" />
                      <Skeleton className="mt-1 h-4 w-16" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="mb-1 text-4xl font-medium text-rust tracking-[-0.009em]">
                        {statsData?.on_sale_count ?? 0}+
                      </div>
                      <div className="text-sm text-white/60 tracking-[-0.009em]">
                        在售套数
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-medium text-rust tracking-[-0.009em]">
                        {statsData?.current_month_sold ?? 0}
                      </div>
                      <div className="text-sm text-white/60 tracking-[-0.009em]">
                        本月已成交
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-medium text-rust tracking-[-0.009em]">
                        400+
                      </div>
                      <div className="text-sm text-white/60 tracking-[-0.009em]">
                        成交经验
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-medium text-rust tracking-[-0.009em]">
                        98.5%
                      </div>
                      <div className="text-sm text-white/60 tracking-[-0.009em]">
                        业主满意度
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="relative aspect-square w-full flex-1">
              {dashboardError ? (
                <div className="flex h-full w-full items-center justify-center rounded-images bg-ink/50">
                  <ImageIcon className="h-16 w-16 text-white/20" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt="Data Analytics Dashboard"
                  className="h-full w-full rounded-images object-cover"
                  src="/about/dashboard.png"
                  loading="lazy"
                  onError={() => setDashboardError(true)}
                />
              )}
              <div className="absolute -bottom-6 -right-6 max-w-xs rounded-cards border border-dove/30 bg-white/90 p-6 shadow-steep backdrop-blur-md max-lg:hidden">
                <div className="mb-2 flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-rust" />
                  <span className="text-[12px] font-medium tracking-[-0.009em] text-ink">
                    实时操盘报告
                  </span>
                </div>
                <p className="text-xs italic text-ash tracking-[-0.009em]">
                  &ldquo;美房宝
                  的介入让我的房源在一周内就收到了3个意向金，最终成交价格远超预期。&rdquo;
                  —— 上海张女士
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden bg-fog py-20">
          <div className="relative z-10 mx-auto max-w-[1200px] px-6 text-center">
            <h2 className="mb-4 font-display text-[44px] leading-[1.1] text-ink">
              准备好让您的资产再次升级了吗？
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-[18px] leading-normal text-ash tracking-[-0.009em]">
              立即免费获取由 美房宝 AI
              估价引擎与专业顾问共同生成的《房产资产优化建议书》。
            </p>
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 md:flex-row">
              <Link
                href="/valuation"
                className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white tracking-[-0.009em] transition-all hover:opacity-90 active:scale-95 md:w-auto"
              >
                免费获取估价
              </Link>
            </div>
            <p className="mt-4 text-xs text-graphite tracking-[-0.009em]">
              我们郑重承诺保护您的隐私，信息仅用于发送建议书。
            </p>
          </div>
        </section>

        {/* Footer is rendered by ClientShell (SiteFooter) */}
      </div>
    </>
  );
}
