import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的 - 美房宝 | Profo",
  description: "管理您的美房宝账户，查看估价记录与个人资料。",
  openGraph: {
    title: "我的 - 美房宝 | Profo",
    description: "管理您的美房宝账户，查看估价记录与个人资料。",
    url: "/my",
  },
};

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
