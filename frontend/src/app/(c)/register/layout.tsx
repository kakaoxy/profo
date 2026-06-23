import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "注册 - 美房宝 | Profo",
  description: "注册美房宝账户，免费获取专业房产估价服务。",
  openGraph: {
    title: "注册 - 美房宝 | Profo",
    description: "注册美房宝账户，免费获取专业房产估价服务。",
    url: "/register",
  },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
