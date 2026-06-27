import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.about.title,
  description: cLocale.meta.about.description,
  openGraph: {
    title: cLocale.meta.about.title,
    description: cLocale.meta.about.description,
    url: "/about",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
