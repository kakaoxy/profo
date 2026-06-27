import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.contact.title,
  description: cLocale.meta.contact.description,
  openGraph: {
    title: cLocale.meta.contact.title,
    description: cLocale.meta.contact.description,
    url: "/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
