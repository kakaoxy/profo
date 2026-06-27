import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.my.title,
  description: cLocale.meta.my.description,
  openGraph: {
    title: cLocale.meta.my.title,
    description: cLocale.meta.my.description,
    url: "/my",
  },
};

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
