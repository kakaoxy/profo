import { Suspense } from "react";
import { AccountFlowsView } from "../_components/account-flows";
import { AccountLockGuard } from "../_components/lock-screen";
import { ModuleLockProvider } from "../_components/module-lock-context";

/**
 * 全部账户流水（设计稿屏 4）.
 *
 * `useSearchParams` 需要 Suspense 边界（Next.js App Router 要求），否则整页退化为
 * 动态渲染并触发构建期警告。
 */
export default function AccountFlowsPage() {
  return (
    <div className="min-h-screen bg-fog">
      <ModuleLockProvider>
        <AccountLockGuard>
          <Suspense fallback={null}>
            <AccountFlowsView />
          </Suspense>
        </AccountLockGuard>
      </ModuleLockProvider>
    </div>
  );
}
