This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## 字体使用说明

本项目通过 [`next/font/local`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) 加载两个**开源**字体（本地文件，无需访问 Google Fonts CDN），并在根布局全局生效：

| 字体 | 本地文件 | 许可 | 设计系统角色（CSS 变量） |
|------|----------|------|--------------------------|
| [Inter](https://rsms.me/inter/) | `src/app/fonts/inter.woff2` | SIL OFL 1.1 | 正文/UI 工作马 → `--font-sohne`（替代商业字体 Söhne） |
| [Source Serif 4](https://github.com/adobe-fonts/source-serif) | `src/app/fonts/source-serif-4.woff2` | SIL OFL 1.1 | 展示衬线（hero/大标题） → `--font-signifier`（替代商业字体 Signifier） |

- 两字体均不含 CJK 字形，中文由系统字体栈回退（iOS 苹方 PingFang SC / Android Noto Sans CJK），跨平台兼容。
- 更多细节见 `docs/frontend-字体审查报告.md`。

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
