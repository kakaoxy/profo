"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Home,
  TrendingUp,
  Clock,
  Users,
  HelpCircle,
  BatteryLow,
  CheckCircle,
  BadgeCheck,
  ImageIcon,
  ArrowRight,
} from "lucide-react";
import { HeroCard } from "@/components/c/shared/HeroCard";
import { PainPointCard } from "@/components/c/shared/PainPointCard";
import { CTAButton } from "@/components/c/shared/CTAButton";
import { StatsCard } from "@/components/c/shared/StatsCard";
import { SoldProjectCard } from "@/components/c/project/SoldProjectCard";
import { Skeleton } from "@/components/ui/skeleton";
import { publicFetcher } from "@/lib/swr";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";
import Link from "next/link";

type PlatformStats = components["schemas"]["PublicPlatformStats"];
type SoldListResponse = components["schemas"]["PublicSoldProjectListResponse"];

const painPointIcons = [
  <Home key="h" className="h-5 w-5" aria-hidden="true" />,
  <TrendingUp key="t" className="h-5 w-5" aria-hidden="true" />,
  <Clock key="c" className="h-5 w-5" aria-hidden="true" />,
  <Users key="u" className="h-5 w-5" aria-hidden="true" />,
  <HelpCircle key="q" className="h-5 w-5" aria-hidden="true" />,
  <BatteryLow key="b" className="h-5 w-5" aria-hidden="true" />,
];

const painPoints = cLocale.about.painPoints.map((point, index) => ({
  icon: painPointIcons[index],
  title: point.title,
  description: point.description,
  color: "text-rust",
  label: point.label,
}));

// PC端专用大图标
const pcPainPointIcons = [
  <Home key="h" className="h-9 w-9" aria-hidden="true" />,
  <TrendingUp key="t" className="h-9 w-9" aria-hidden="true" />,
  <Clock key="c" className="h-9 w-9" aria-hidden="true" />,
  <Users key="u" className="h-9 w-9" aria-hidden="true" />,
  <HelpCircle key="q" className="h-9 w-9" aria-hidden="true" />,
  <BatteryLow key="b" className="h-9 w-9" aria-hidden="true" />,
];

export default function AboutPage() {
  const { data: statsData, isLoading } = useSWR<PlatformStats>(
    "/api/v1/public/stats/platform",
    publicFetcher
  );
  const { data: soldData } = useSWR<SoldListResponse>(
    "/api/v1/public/projects/sold",
    publicFetcher
  );
  const [heroError, setHeroError] = useState(false);
  const [dashboardError, setDashboardError] = useState(false);

  return (
    <>
      {/* ========== 移动端布局 ========== */}
      <div className="mx-auto max-w-[600px] px-4 pt-8 pb-8 md:hidden">
        <div className="space-y-6">
          <HeroCard label={cLocale.about.mobile.heroLabel} title={cLocale.about.mobile.heroTitle}>
            <p className="mt-4 text-sm text-ash tracking-[-0.009em]">
              {cLocale.about.mobile.experiencing}
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
              {cLocale.about.mobile.fullProcessTitle}
            </p>
            <p className="mt-2 text-base text-ash tracking-[-0.009em]">
              {cLocale.about.mobile.fullProcessDesc}
            </p>
          </HeroCard>

          <div className="rounded-cards bg-white p-6 shadow-steep-sm">
            <h3 className="text-xl font-medium text-ink tracking-[-0.009em]">
              {cLocale.about.mobile.serviceTitle}
            </h3>
            <ul className="mt-5 space-y-3">
              {cLocale.about.serviceFeatures.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-rust" aria-hidden="true" />
                  <span className="text-sm text-ink tracking-[-0.009em]">
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <HeroCard label={cLocale.about.mobile.operationLabel} title={cLocale.about.mobile.operationTitle}>
            <div className="mt-6 space-y-0">
              {cLocale.about.processSteps.map((step, index) => (
                <div key={step.num} className="relative flex gap-4 pb-6 last:pb-0">
                  {index < cLocale.about.processSteps.length - 1 && (
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
              {cLocale.about.mobile.ownersTitle}
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
                    label={cLocale.about.mobile.statOnSale}
                  />
                  <StatsCard
                    value={statsData?.current_month_sold ?? 0}
                    label={cLocale.about.mobile.statMonthSold}
                  />
                </>
              )}
            </div>
          </div>

          <HeroCard label={cLocale.about.mobile.valuationLabel} title={cLocale.about.mobile.valuationTitle}>
            <p className="mt-3 text-sm text-ash tracking-[-0.009em]">
              {cLocale.about.mobile.valuationDesc}
            </p>
            <div className="mt-6">
              <CTAButton href="/valuation">{cLocale.about.mobile.cta}</CTAButton>
            </div>
            <p className="mt-4 text-center text-xs text-graphite tracking-[-0.009em]">
              {cLocale.about.mobile.privacyNote}
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
                alt={cLocale.about.pc.heroImgAlt}
                className="h-full w-full object-cover opacity-25"
                src="/about/hero-bg.png"
                width={1920}
                height={1080}
                fetchPriority="high"
                onError={() => setHeroError(true)}
              />
            )}
          </div>
          <div className="relative z-10 mx-auto w-full max-w-[1200px] px-6">
            <div className="max-w-2xl">
              <h1 className="mb-4 font-display text-[44px] leading-[1.1] text-ink">
                {cLocale.about.pc.heroTitleLine1}
                <br />
                {cLocale.about.pc.heroTitleLine2}
              </h1>
              <p className="mb-8 text-[18px] leading-normal text-ash tracking-[-0.009em]">
                {cLocale.about.pc.heroDesc}
              </p>
              <div className="flex items-center gap-6">
                <Link
                  href="/valuation"
                  className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white tracking-[-0.009em] transition-all hover:opacity-90"
                >
                  {cLocale.about.pc.startCta}
                </Link>
                <a
                  href="#process"
                  className="text-[15px] font-medium text-ink tracking-[-0.009em] hover:underline"
                >
                  {cLocale.about.pc.learnMore}
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
                {cLocale.about.pc.painPointsEyebrow}
              </span>
              <h2 className="mt-2 font-display text-[44px] leading-[1.1] text-ink">
                {cLocale.about.pc.painPointsTitle}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-8">
              {painPoints.map((point, index) => (
                <div
                  key={point.title}
                  className="flex h-80 flex-col justify-between rounded-cards bg-white p-8 shadow-steep-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-steep"
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
                  {cLocale.about.pc.methodologyEyebrow}
                </span>
                <h2 className="mt-2 font-display text-[44px] leading-[1.1] text-ink">
                  {cLocale.about.pc.methodologyTitle}
                </h2>
              </div>
              <p className="max-w-md text-[16px] leading-normal text-ash tracking-[-0.009em]">
                {cLocale.about.pc.methodologyDesc}
              </p>
            </div>
            <div className="flex gap-8">
              {cLocale.about.processSteps.map((step) => (
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
                {cLocale.about.pc.servicesEyebrow}
              </span>
              <h2 className="mt-2 font-display text-[44px] leading-[1.1] text-ink">
                {cLocale.about.pc.servicesTitle}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {cLocale.about.serviceFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-3 rounded-cards bg-white p-6 shadow-steep-sm transition-transform duration-300 hover:-translate-y-1 hover:shadow-steep"
                >
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-rust" aria-hidden="true" />
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
                {cLocale.about.pc.trustTitle}
              </h2>
              <p className="mb-8 text-[18px] leading-normal text-white/70 tracking-[-0.009em]">
                {cLocale.about.pc.trustDesc}
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
                  </>
                ) : (
                  <>
                    <div>
                      <div className="mb-1 text-4xl font-medium text-rust tracking-[-0.009em]">
                        {statsData?.on_sale_count ?? 0}
                      </div>
                      <div className="text-sm text-white/60 tracking-[-0.009em]">
                        {cLocale.about.pc.statOnSale}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-4xl font-medium text-rust tracking-[-0.009em]">
                        {statsData?.current_month_sold ?? 0}
                      </div>
                      <div className="text-sm text-white/60 tracking-[-0.009em]">
                        {cLocale.about.pc.statMonthSold}
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
                  alt={cLocale.about.pc.dashboardImgAlt}
                  className="h-full w-full rounded-images object-cover"
                  src="/about/dashboard.png"
                  width={600}
                  height={600}
                  loading="lazy"
                  onError={() => setDashboardError(true)}
                />
              )}
              <div className="absolute -bottom-6 -right-6 max-w-xs rounded-cards border border-dove/30 bg-white/90 p-6 shadow-steep backdrop-blur-md max-lg:hidden">
                <div className="mb-2 flex items-center gap-2">
                  <BadgeCheck className="h-5 w-5 text-rust" aria-hidden="true" />
                  <span className="text-[12px] font-medium tracking-[-0.009em] text-ink">
                    {cLocale.about.pc.reportBadge}
                  </span>
                </div>
                <p className="text-xs text-ash tracking-[-0.009em]">
                  {cLocale.about.oneLiner}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="relative overflow-hidden bg-fog py-20">
          <div className="relative z-10 mx-auto max-w-[1200px] px-6 text-center">
            <h2 className="mb-4 font-display text-[44px] leading-[1.1] text-ink">
              {cLocale.about.pc.ctaTitle}
            </h2>
            <p className="mx-auto mb-8 max-w-2xl text-[18px] leading-normal text-ash tracking-[-0.009em]">
              {cLocale.about.pc.ctaDesc}
            </p>
            <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 md:flex-row">
              <Link
                href="/valuation"
                className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-full bg-ink px-5 py-2.5 text-[15px] font-medium text-white tracking-[-0.009em] transition-all hover:opacity-90 active:scale-95 md:w-auto"
              >
                {cLocale.about.pc.ctaButton}
              </Link>
            </div>
            <p className="mt-4 text-xs text-graphite tracking-[-0.009em]">
              {cLocale.about.pc.privacyNote}
            </p>
          </div>
        </section>

        {/* Footer is rendered by ClientShell (SiteFooter) */}
      </div>

      {/* ========== 新增模块（响应式，移动端/PC 端共用） ========== */}

      {/* 算账模块 */}
      <section className="bg-white py-12 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl md:text-[44px] md:leading-[1.1] text-ink">
              {cLocale.about.calculation.title}
            </h2>
            <p className="mt-3 text-sm md:text-base text-ash tracking-[-0.009em]">
              {cLocale.about.calculation.subtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
            {cLocale.about.calculation.cases.map((item) => (
              <div
                key={item.scenario}
                className="flex flex-col rounded-cards bg-white p-6 shadow-steep-sm border border-dove/30"
              >
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-rust">
                  {item.scenario}
                </span>
                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ash">成交价</span>
                    <span className="font-medium text-ink">{item.soldPrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ash">业主拿到</span>
                    <span className="font-medium text-rust">{item.ownerGets}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ash">公司盈亏</span>
                    <span className="font-medium text-ink">{item.company}</span>
                  </div>
                </div>
                <p className="mt-4 border-t border-dove/30 pt-3 text-xs text-graphite tracking-[-0.009em]">
                  {item.note}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm font-medium text-ink tracking-[-0.009em]">
            {cLocale.about.calculation.bottomLine}
          </p>
        </div>
      </section>

      {/* FAQ（每条用 details 折叠，移动端默认收起，减少滚动疲劳） */}
      <section id="faq" className="bg-fog py-12 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl md:text-[44px] md:leading-[1.1] text-ink">
              你可能想问
            </h2>
          </div>
          <div className="mx-auto max-w-3xl space-y-3">
            {cLocale.about.faq.map((item) => (
              <details
                key={item.q}
                className="group rounded-cards bg-white p-5 shadow-steep-sm border border-dove/30"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-ink tracking-[-0.009em]">
                  {item.q}
                  <span className="ml-4 shrink-0 text-graphite transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ash tracking-[-0.009em]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-graphite tracking-[-0.009em]">
            {cLocale.about.riskNote}
          </p>
        </div>
      </section>

      {/* 三方对比 */}
      <section className="bg-white py-12 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl md:text-[44px] md:leading-[1.1] text-ink">
              {cLocale.about.comparison.title}
            </h2>
          </div>
          <div className="overflow-x-auto rounded-cards bg-white shadow-steep-sm border border-dove/30">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dove/30">
                  {cLocale.about.comparison.headers.map((h, i) => (
                    <th
                      key={h || i}
                      className={`px-4 py-4 text-left font-medium tracking-[-0.009em] ${i === 3 ? "text-rust" : "text-ink"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cLocale.about.comparison.rows.map((row) => (
                  <tr key={row.aspect} className="border-b border-dove/20 last:border-b-0">
                    <td className="px-4 py-4 font-medium text-ink tracking-[-0.009em]">
                      {row.aspect}
                    </td>
                    <td className="px-4 py-4 text-ash tracking-[-0.009em]">{row.decorator}</td>
                    <td className="px-4 py-4 text-ash tracking-[-0.009em]">{row.agent}</td>
                    <td className="px-4 py-4 text-ink tracking-[-0.009em]">{row.profo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 适合房子 */}
      <section className="bg-fog py-12 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl md:text-[44px] md:leading-[1.1] text-ink">
              {cLocale.about.suitable.title}
            </h2>
          </div>
          <div className="mx-auto max-w-3xl rounded-cards bg-white p-6 md:p-8 shadow-steep-sm border border-dove/30">
            <ul className="space-y-3">
              {cLocale.about.suitable.criteria.map((c) => (
                <li key={c} className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-rust" aria-hidden="true" />
                  <span className="text-sm text-ink tracking-[-0.009em]">{c}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-dove/30 pt-4 text-sm text-ash tracking-[-0.009em]">
              {cLocale.about.suitable.boundary}
            </p>
          </div>
        </div>
      </section>

      {/* 真实成交案例精选 */}
      <section className="bg-white py-12 md:py-20">
        <div className="mx-auto max-w-[1200px] px-4 md:px-6">
          <div className="mb-8 text-center">
            <h2 className="font-display text-2xl md:text-[44px] md:leading-[1.1] text-ink">
              {cLocale.about.casesTitle}
            </h2>
            <p className="mt-3 text-sm md:text-base text-ash tracking-[-0.009em]">
              {cLocale.about.casesSubtitle}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {soldData?.items.slice(0, 3).map((project) => (
              <SoldProjectCard
                key={project.id}
                id={project.id}
                communityName={project.community_name ?? null}
                layout={project.layout}
                area={project.area}
                totalPrice={project.total_price}
                unitPrice={project.unit_price}
                title={project.title}
                coverImage={project.cover_image ?? null}
                soldDays={project.sold_days ?? null}
                decorationStyle={project.decoration_style ?? null}
              />
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 text-[15px] font-medium text-ink tracking-[-0.009em] hover:underline"
            >
              {cLocale.about.casesMore}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
