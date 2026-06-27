import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.profile.title,
  description: cLocale.meta.profile.description,
  openGraph: {
    title: cLocale.meta.profile.title,
    description: cLocale.meta.profile.description,
    url: "/profile",
  },
};

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
