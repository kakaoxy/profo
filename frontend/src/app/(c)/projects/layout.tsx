import type { Metadata } from "next";
import { cLocale } from "@/lib/i18n/c-locale";

export const metadata: Metadata = {
  title: cLocale.meta.projects.title,
  description: cLocale.meta.projects.description,
  openGraph: {
    title: cLocale.meta.projects.title,
    description: cLocale.meta.projects.description,
    url: "/projects",
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
