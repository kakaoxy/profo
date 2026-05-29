import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "服务介绍 - 美房宝 | Profo",
  description: "了解美房宝全案操盘服务：我们出资装修、约定兜底价、专业团队精准定价，让您的房子第一眼胜出。",
  openGraph: {
    title: "服务介绍 - 美房宝 | Profo",
    description: "了解美房宝全案操盘服务：我们出资装修、约定兜底价、专业团队精准定价，让您的房子第一眼胜出。",
    url: "/c/about",
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
