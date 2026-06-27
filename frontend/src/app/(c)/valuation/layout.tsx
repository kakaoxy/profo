import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.valuation.title,
  description: cLocale.meta.valuation.description,
  openGraph: {
    title: cLocale.meta.valuation.title,
    description: cLocale.meta.valuation.description,
    url: "/valuation",
  },
};

export default function ValuationLayout({ children }: { children: React.ReactNode }) {
  return children;
}
