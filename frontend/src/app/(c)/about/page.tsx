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
  Share2,
  Globe,
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
    color: "text-c-status-onsale",
    label: "01 — 视觉资产贬值",
  },
  {
    icon: <TrendingUp className="h-5 w-5" />,
    title: "定价全凭感觉，进退两难",
    description: "挂高没人看，挂低怕吃亏",
    color: "text-c-status-upcoming",
    label: "02 — 价格锚点缺失",
  },
  {
    icon: <Clock className="h-5 w-5" />,
    title: "挂牌后带看越来越稀",
    description: "头两周热闹，后面一个月没一组",
    color: "text-c-error",
    label: "03 — 流动性陷阱",
  },
  {
    icon: <Users className="h-5 w-5" />,
    title: "商圈动辄几百套在挂",
    description: "你的房子凭什么被选中？",
    color: "text-c-status-onsale",
    label: "04 — 竞争红海",
  },
  {
    icon: <HelpCircle className="h-5 w-5" />,
    title: "周期没谱，全看运气",
    description: "快则两三个月，慢则遥遥无期",
    color: "text-c-status-upcoming",
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
      {/* ========== 移动端布局（保持不变） ========== */}
      <div className="mx-auto max-w-[600px] px-4 pt-8 pb-8 md:hidden">
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
              <CTAButton href="/valuation">免费获取估价</CTAButton>
            </div>
            <p className="mt-4 text-center text-xs text-white/50">
              100% 隐私保密 · 专业精准评估
            </p>
          </HeroCard>
        </div>
      </div>

      {/* ========== PC端布局（与 about.html 视觉一致） ========== */}
      <div className="hidden md:block">
        {/* Hero Section */}
        <section className="relative flex h-[819px] w-full items-center overflow-hidden bg-[#131b2e]">
          <div className="absolute inset-0 z-0">
            {heroError ? (
              <div className="flex h-full w-full items-center justify-center bg-[#131b2e]">
                <ImageIcon className="h-16 w-16 text-white/20" />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Modern Luxury Interior"
                className="h-full w-full object-cover opacity-60"
                src="/about/hero-bg.jpg"
                fetchPriority="high"
                onError={() => setHeroError(true)}
              />
            )}
          </div>
          <div className="relative z-10 mx-auto w-full max-w-[1280px] px-6">
            <div className="max-w-2xl text-white">
              <h1 className="mb-4 text-[40px] leading-[48px] font-bold tracking-[-0.02em]">
                专业赋能，
                <br />
                让每一套房产焕发应有价值
              </h1>
              <p className="mb-8 text-[18px] leading-[28px] opacity-90">
                美房宝
                致力于为业主提供全链路资产管理与交易优化服务，通过专业审美与数据驱动，解决房产流通中的一切痛点。
              </p>
              <div className="flex gap-4">
                <Link
                  href="/valuation"
                  className="rounded-lg bg-c-action-gold px-8 py-4 text-[12px] font-bold leading-[16px] tracking-[0.05em] text-c-trust-blue transition-all hover:brightness-110"
                >
                  开启专业操盘
                </Link>
                <a
                  href="#process"
                  className="rounded-lg border border-white px-8 py-4 text-[12px] font-bold leading-[16px] tracking-[0.05em] text-white transition-all hover:bg-white/10"
                >
                  了解更多服务
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Pain Points Section */}
        <section className="mx-auto max-w-[1280px] px-6 py-16">
          <div className="mb-16 text-center">
            <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-c-action-gold">
              Pain Points
            </span>
            <h2 className="mt-2 text-[40px] leading-[48px] font-bold tracking-[-0.02em] text-c-trust-blue">
              房东面临的真实挑战
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-8">
            {painPoints.map((point, index) => (
              <div
                key={point.title}
                className="flex h-80 flex-col justify-between rounded-xl border border-c-border-subtle bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(15,23,42,0.05)]"
              >
                <div>
                  <span className={`mb-4 block ${point.color}`}>
                    {pcPainPointIcons[index]}
                  </span>
                  <h3 className="mb-2 text-[20px] leading-[28px] font-semibold text-c-text-primary">
                    {point.title}
                  </h3>
                  <p className="text-[14px] leading-[20px] text-c-text-secondary">
                    {point.description}
                  </p>
                </div>
                <div
                  className={`text-[12px] font-bold leading-[16px] tracking-[0.05em] ${point.color}`}
                >
                  {point.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Process Section */}
        <section id="process" className="bg-[#f2f4f6] py-16">
          <div className="mx-auto max-w-[1280px] px-6">
            <div className="mb-16 flex flex-col items-end justify-between gap-4 md:flex-row">
              <div className="max-w-xl">
                <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-c-action-gold">
                  Our Methodology
                </span>
                <h2 className="mt-2 text-[40px] leading-[48px] font-bold tracking-[-0.02em] text-c-trust-blue">
                  美房宝 全案操盘三部曲
                </h2>
              </div>
              <p className="max-w-md text-[16px] leading-[24px] text-c-text-secondary">
                我们不仅仅是中介，更是您的房产产品经理。从诊断到成交，每一步都精益求精。
              </p>
            </div>
            <div className="flex gap-8">
              {processSteps.map((step) => (
                <div key={step.num} className="group flex-1">
                  <div className="relative z-10 h-full rounded-xl border border-c-border-subtle bg-white p-8">
                    <div className="mb-4 text-6xl font-extrabold text-[#e0e3e5] opacity-30 transition-colors group-hover:text-c-action-gold">
                      {step.num}
                    </div>
                    <h4 className="mb-2 text-[20px] leading-[28px] font-semibold text-c-text-primary">
                      {step.title}
                    </h4>
                    <p className="text-[14px] leading-[20px] text-c-text-secondary">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Service Features Section */}
        <section className="mx-auto max-w-[1280px] px-6 py-16">
          <div className="mb-16 text-center">
            <span className="text-[12px] font-bold uppercase tracking-[0.2em] text-c-action-gold">
              Our Services
            </span>
            <h2 className="mt-2 text-[40px] leading-[48px] font-bold tracking-[-0.02em] text-c-trust-blue">
              我们的服务保障
            </h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {serviceFeatures.map((feature) => (
              <div
                key={feature}
                className="flex items-start gap-3 rounded-xl border border-c-border-subtle bg-white p-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_4px_20px_rgba(15,23,42,0.05)]"
              >
                <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-c-action-gold" />
                <span className="text-[14px] leading-[20px] text-c-text-primary">
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Social Proof Section */}
        <section className="mx-auto max-w-[1280px] px-6 py-16">
          <div className="flex flex-col items-center gap-12 rounded-3xl bg-c-trust-blue p-8 text-white md:flex-row md:p-16">
            <div className="flex-1">
              <h2 className="mb-4 text-[40px] leading-[48px] font-bold tracking-[-0.02em]">
                业主信任的专业保障
              </h2>
              <p className="mb-8 text-[18px] leading-[28px] opacity-80">
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
                      <div className="mb-1 text-4xl font-bold text-c-action-gold">
                        {statsData?.on_sale_count ?? 0}+
                      </div>
                      <div className="text-sm opacity-60">在售套数</div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-bold text-c-action-gold">
                        {statsData?.current_month_sold ?? 0}
                      </div>
                      <div className="text-sm opacity-60">本月已成交</div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-bold text-c-action-gold">
                        400+
                      </div>
                      <div className="text-sm opacity-60">成交经验</div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-bold text-c-action-gold">
                        98.5%
                      </div>
                      <div className="text-sm opacity-60">业主满意度</div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="relative aspect-square w-full flex-1">
              {dashboardError ? (
                <div className="flex h-full w-full items-center justify-center rounded-2xl bg-c-trust-blue/50">
                  <ImageIcon className="h-16 w-16 text-white/20" />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
              <img
                  alt="Data Analytics Dashboard"
                  className="h-full w-full rounded-2xl object-cover"
                  src="/about/dashboard.jpg"
                  loading="lazy"
                  onError={() => setDashboardError(true)}
                />
              )}
              <div className="absolute -bottom-6 -right-6 max-w-xs rounded-xl border border-white/20 bg-white/80 p-6 shadow-xl backdrop-blur-[12px] max-lg:hidden text-c-trust-blue">
                <div className="mb-2 flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-green-600" />
                  <span className="text-[12px] font-bold leading-[16px] tracking-[0.05em]">
                    实时操盘报告
                  </span>
                </div>
                <p className="text-xs italic opacity-80">
                  &ldquo;美房宝
                  的介入让我的房源在一周内就收到了3个意向金，最终成交价格远超预期。&rdquo;
                  —— 上海张女士
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden bg-c-surface py-16">
          <div className="relative z-10 mx-auto max-w-[1280px] px-6 text-center">
            <h2 className="mb-4 text-[40px] leading-[48px] font-bold tracking-[-0.02em] text-c-trust-blue">
              准备好让您的资产再次升级了吗？
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-[18px] leading-[28px] text-c-text-secondary">
              立即免费获取由 美房宝 AI
              估价引擎与专业顾问共同生成的《房产资产优化建议书》。
            </p>
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 md:flex-row">
              <Link
                href="/valuation"
                className="w-full whitespace-nowrap rounded-lg bg-c-trust-blue px-10 py-4 text-[12px] font-bold leading-[16px] tracking-[0.05em] text-white shadow-lg transition-all hover:bg-black active:scale-95 md:w-auto"
              >
                免费获取估价
              </Link>
            </div>
            <p className="mt-4 text-xs text-c-text-secondary opacity-60">
              我们郑重承诺保护您的隐私，信息仅用于发送建议书。
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full bg-[#131b2e] px-6 py-8">
          <div className="mx-auto grid max-w-[1280px] grid-cols-4 gap-8">
            <div className="col-span-1">
              <div className="mb-2 text-[20px] leading-[28px] font-bold text-white">
                美房宝
              </div>
              <p className="text-[14px] leading-[20px] text-[#7c839b] opacity-80">
                重新定义高端不动产交易体验。
              </p>
            </div>
            <div>
              <h5 className="mb-2 text-[12px] font-bold leading-[16px] tracking-[0.05em] text-white">
                产品
              </h5>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/valuation"
                    className="text-[14px] leading-[20px] text-[#7c839b] opacity-80 transition-all hover:opacity-100"
                  >
                    房源估价
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    className="text-[14px] leading-[20px] text-[#7c839b] opacity-80 transition-all hover:opacity-100"
                  >
                    全案操盘
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-[14px] leading-[20px] text-[#7c839b] opacity-80 transition-all hover:opacity-100"
                  >
                    设计师合作
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="mb-2 text-[12px] font-bold leading-[16px] tracking-[0.05em] text-white">
                公司
              </h5>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/about"
                    className="text-[14px] leading-[20px] text-[#7c839b] opacity-80 transition-all hover:opacity-100"
                  >
                    公司简介
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-[14px] leading-[20px] text-[#7c839b] opacity-80 transition-all hover:opacity-100"
                  >
                    联系我们
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h5 className="mb-2 text-[12px] font-bold leading-[16px] tracking-[0.05em] text-white">
                法律
              </h5>
              <ul className="space-y-2">
                <li>
                  <span className="text-[14px] leading-[20px] text-[#7c839b] opacity-80">
                    隐私政策
                  </span>
                </li>
                <li>
                  <span className="text-[14px] leading-[20px] text-[#7c839b] opacity-80">
                    服务条款
                  </span>
                </li>
              </ul>
            </div>
          </div>
          <div className="mx-auto mt-8 flex max-w-[1280px] flex-col items-center justify-between gap-2 border-t border-white/10 pt-8 md:flex-row">
            <p className="text-[14px] leading-[20px] text-[#7c839b] opacity-60">
              © 2024 美房宝 Real Estate. All rights reserved.
            </p>
            <div className="flex gap-4">
              <Share2 className="h-5 w-5 cursor-pointer text-white opacity-60 transition-all hover:opacity-100" />
              <Globe className="h-5 w-5 cursor-pointer text-white opacity-60 transition-all hover:opacity-100" />
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
