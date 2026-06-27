import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.leads.title,
  description: cLocale.meta.leads.description,
  openGraph: {
    title: cLocale.meta.leads.title,
    description: cLocale.meta.leads.description,
    url: "/leads",
  },
};

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
