import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { SWRProvider } from "@/components/swr-provider";
// 1. 引入组件 (现在文件应该存在了)
import { Toaster } from "@/components/ui/sonner";

// 改用 next/font/local：Docker 构建环境无法访问 Google Fonts CDN，build 时下载字体会失败
const inter = localFont({
  src: "./fonts/inter.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

const sourceSerif = localFont({
  src: "./fonts/source-serif-4.woff2",
  variable: "--font-source-serif",
  weight: "200 900",
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