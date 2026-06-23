import type { Metadata } from "next";
import ClientShell from "@/components/c/layout/ClientShell";

export const metadata: Metadata = {
  title: "美房宝 - 专业房产估价与装修增值服务 | Profo",
  description: "美房宝为您提供专业房产估价、装修增值、精准营销一站式卖房服务。400+业主信赖选择，让您的房子卖得更快、价格更高。",
  openGraph: {
    title: "美房宝 - 专业房产估价与装修增值服务 | Profo",
    description: "美房宝为您提供专业房产估价、装修增值、精准营销一站式卖房服务。400+业主信赖选择，让您的房子卖得更快、价格更高。",
    url: "/",
  },
};

export default function CLayout({ children }: { children: React.ReactNode }) {
  return <ClientShell>{children}</ClientShell>;
}
