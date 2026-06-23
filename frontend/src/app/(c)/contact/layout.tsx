import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "成交案例 - 美房宝 | Profo",
  description: "查看美房宝真实成交案例与市场数据，用数据说话，了解同小区同户型的成交价格。",
  openGraph: {
    title: "成交案例 - 美房宝 | Profo",
    description: "查看美房宝真实成交案例与市场数据，用数据说话，了解同小区同户型的成交价格。",
    url: "/contact",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
