import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { getApiKeyInfoAction } from "./actions";
import { ApiKeyClient } from "./components/api-key-client";

export default async function ApiKeyPage() {
  const result = await getApiKeyInfoAction();

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader title="API Key 管理" description="管理您的 API Key，用于程序化的接口访问" />

        {/* 内容区 */}
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center rounded-cards bg-white shadow-steep">
              <Loader2 className="h-8 w-8 animate-spin text-graphite" />
            </div>
          }
        >
          <ApiKeyClient initialData={result.success ? (result.data ?? null) : null} />
        </Suspense>

        {/* 使用说明 */}
        <div className="rounded-cards bg-white p-6 shadow-steep">
          <h2 className="mb-3 text-sm font-medium text-ink">使用说明</h2>
          <ul className="space-y-2 text-sm text-graphite">
            <li className="flex items-start gap-2">
              <span aria-hidden="true">•</span>
              <span>API Key 用于程序化访问系统接口，请妥善保管，不要泄露给他人</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true">•</span>
              <span>每个用户只能拥有一个有效的 API Key，生成新 Key 会自动撤销旧 Key</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true">•</span>
              <span>
                在请求头中添加{" "}
                <code className="rounded-inputs bg-fog px-1.5 py-0.5 font-mono text-xs text-ink">
                  X-API-Key: your-api-key
                </code>{" "}
                进行认证
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden="true">•</span>
              <span>完整的 API Key 仅在生成时显示一次，请务必及时复制保存</span>
            </li>
          </ul>
        </div>
      </PageContainer>
    </div>
  );
}
