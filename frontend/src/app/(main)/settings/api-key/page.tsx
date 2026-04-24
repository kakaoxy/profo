import { Suspense } from "react";
import { Loader2, KeyRound } from "lucide-react";
import { getApiKeyInfoAction } from "./actions";
import { ApiKeyClient } from "./components/api-key-client";

export default async function ApiKeyPage() {
  const result = await getApiKeyInfoAction();

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 pt-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
          <KeyRound className="h-5 w-5 text-slate-600 dark:text-slate-400" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">API Key 管理</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            管理您的 API Key，用于程序化的接口访问
          </p>
        </div>
      </div>

      {/* Content */}
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
          </div>
        }
      >
        <ApiKeyClient initialData={result.success ? result.data ?? null : null} />
      </Suspense>

      {/* Usage Guide */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          使用说明
        </h3>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="text-slate-400">•</span>
            <span>API Key 用于程序化访问系统接口，请妥善保管，不要泄露给他人</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400">•</span>
            <span>每个用户只能拥有一个有效的 API Key，生成新 Key 会自动撤销旧 Key</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400">•</span>
            <span>在请求头中添加 <code className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono text-xs">X-API-Key: your-api-key</code> 进行认证</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-slate-400">•</span>
            <span>完整的 API Key 仅在生成时显示一次，请务必及时复制保存</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
