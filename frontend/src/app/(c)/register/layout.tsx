import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.register.title,
  description: cLocale.meta.register.description,
  openGraph: {
    title: cLocale.meta.register.title,
    description: cLocale.meta.register.description,
    url: "/register",
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
