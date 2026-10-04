import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { SubscribeTemplatesClient } from "./subscribe-templates-client";

/**
 * 订阅消息模板配置页（RSC 壳）.
 *
 * 数据由客户端组件挂载时经 openapi-fetch 拉取（配置含 env 兜底值与生效来源，
 * 无需 SSR 首屏取数）；RSC 仅提供页面骨架。
 */
export default function SubscribeTemplatesPage() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="订阅消息模板"
          description="配置小程序订阅消息模板 ID，保存后即时生效；留空回退环境变量兜底值"
        />
        <SubscribeTemplatesClient />
      </PageContainer>
    </div>
  );
}
