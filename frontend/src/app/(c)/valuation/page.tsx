import Link from "next/link";
import { ValuationForm } from "@/components/c/lead/ValuationForm";
import { ValuationSidebar } from "@/components/c/lead/ValuationSidebar";
import { cLocale } from "@/lib/i18n/c-locale";

export default function ValuationPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 md:px-6 py-6 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <span className="inline-block rounded-full bg-apricot-wash px-3 py-1 text-xs font-medium tracking-[-0.009em] text-rust">
          {cLocale.valuation.badge}
        </span>
        <h1 className="mt-3 text-xl sm:text-2xl font-medium text-ink tracking-[-0.009em]">{cLocale.valuation.title}</h1>
        <p className="mt-1.5 sm:mt-2 text-sm text-ash tracking-[-0.009em]">
          {cLocale.valuation.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <ValuationForm />
        </div>
        <div className="hidden lg:block lg:col-span-4">
          <ValuationSidebar />
        </div>
      </div>

      {/* 隐私声明 */}
      <p className="mt-6 text-xs text-graphite tracking-[-0.009em]">
        {cLocale.valuation.privacyNote}
      </p>

      {/* 你可能的疑问（链到 about#faq） */}
      <section className="mt-8 rounded-cards bg-white p-5 sm:p-6 shadow-steep-sm border border-dove/30">
        <h2 className="text-base font-medium text-ink tracking-[-0.009em]">
          {cLocale.valuation.quickFaqsTitle}
        </h2>
        <ul className="mt-4 space-y-3">
          {cLocale.valuation.quickFaqs.map((item) => (
            <li key={item.q} className="flex flex-col gap-1">
              <span className="text-sm font-medium text-ink tracking-[-0.009em]">
                {item.q}
              </span>
              <span className="text-sm text-ash tracking-[-0.009em]">
                {item.a}
              </span>
            </li>
          ))}
        </ul>
        <Link
          href="/about#faq"
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-rust hover:underline"
        >
          {cLocale.valuation.quickFaqsMore}
        </Link>
      </section>

      {/* 风险告知微文案（合规需要） */}
      <p className="mt-6 text-xs text-graphite tracking-[-0.009em]">
        {cLocale.valuation.riskNote}
      </p>
    </div>
  );
}
