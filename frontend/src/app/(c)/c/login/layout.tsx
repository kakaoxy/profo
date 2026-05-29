import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 - 美房宝 | Profo",
  description: "登录美房宝账户，查看您的房产估价记录与专业顾问建议。",
  openGraph: {
    title: "登录 - 美房宝 | Profo",
    description: "登录美房宝账户，查看您的房产估价记录与专业顾问建议。",
    url: "/c/login",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
