import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "估价详情 - 美房宝 | Profo",
  description: "查看您的房产估价详情与专业顾问跟进反馈。",
  openGraph: {
    title: "估价详情 - 美房宝 | Profo",
    description: "查看您的房产估价详情与专业顾问跟进反馈。",
    url: "/c/leads",
  },
};

export default function LeadsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
