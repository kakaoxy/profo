import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.login.title,
  description: cLocale.meta.login.description,
  openGraph: {
    title: cLocale.meta.login.title,
    description: cLocale.meta.login.description,
    url: "/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
