import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "房源详情 - 美房宝 | Profo",
  description: "查看房源详细信息、装修改造过程与专业顾问联系方式。",
  openGraph: {
    title: "房源详情 - 美房宝 | Profo",
    description: "查看房源详细信息、装修改造过程与专业顾问联系方式。",
    url: "/c/projects",
  },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
