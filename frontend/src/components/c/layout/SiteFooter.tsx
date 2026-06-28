import Link from "next/link";
import { Phone, Mail, MapPin, Globe, Share2 } from "lucide-react";
import { cLocale } from "@/lib/i18n/c-locale";

export function SiteFooter() {
  return (
    <footer className="bg-ink px-6 py-16 md:py-20">
      <div className="mx-auto max-w-[1200px]">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <span className="text-xl font-semibold text-white">Profo</span>
            <p className="mt-3 text-sm leading-relaxed text-white/60">
              美房宝 — 出钱装修、全权卖房。卖到约定价您拿钱，卖不到装修免费送。
            </p>
          </div>

          {/* Explore */}
          <div>
            <h5 className="mb-4 text-xs font-medium uppercase tracking-widest text-white">
              房源探索
            </h5>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/?status=在售"
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  在售房源
                </Link>
              </li>
              <li>
                <Link
                  href="/?status=在途"
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  装修中房源
                </Link>
              </li>
              <li>
                <Link
                  href="/?status=已售"
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  过往案例
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h5 className="mb-4 text-xs font-medium uppercase tracking-widest text-white">
              关于公司
            </h5>
            <ul className="space-y-2.5">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  服务介绍
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  真实成交
                </Link>
              </li>
              <li>
                <Link
                  href="/valuation"
                  className="text-sm text-white/60 transition-colors hover:text-white"
                >
                  免费评估
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h5 className="mb-4 text-xs font-medium uppercase tracking-widest text-white">
              联系我们
            </h5>
            <ul className="space-y-2.5">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm text-white/60">上海市浦东新区</span>
              </li>
              <li className="flex items-start gap-2">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm text-white/60">{cLocale.common.contact.hotlinePlaceholder}</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0 text-white/40" />
                <span className="text-sm text-white/60">contact@profo.com</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-white/40">
            {cLocale.common.brand.copyright}
          </p>
          <div className="flex gap-4">
            <Share2 className="h-5 w-5 cursor-pointer text-white/40 transition-colors hover:text-white" />
            <Globe className="h-5 w-5 cursor-pointer text-white/40 transition-colors hover:text-white" />
          </div>
        </div>
      </div>
    </footer>
  );
}
