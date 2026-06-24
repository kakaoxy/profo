import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { SWRProvider } from "@/components/swr-provider";
// 1. 引入组件 (现在文件应该存在了)
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  weight: ["400"],
  style: ["normal"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Profo",
  description: "Profo",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} ${sourceSerif.variable} font-(--font-sohne) antialiased`}>
        <NuqsAdapter>
          <SWRProvider>
            {children}
          </SWRProvider>
        </NuqsAdapter>

        {/* 2. 关键修复：把组件放在这里渲染 */}
        <Toaster />
      </body>
    </html>
  );
}