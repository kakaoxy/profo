import { AccountDetail } from "../_components/account-detail";
import { AccountLockGuard } from "../_components/lock-screen";
import { ModuleLockProvider } from "../_components/module-lock-context";

interface PageProps {
  params: Promise<{ accountId: string }>;
}

/**
 * 账户详情（设计稿屏 2）.
 *
 * 客户端渲染原因同总览页：解锁令牌 + 倒计时属于浏览器状态；数据仍走 Server Actions。
 */
export default async function AccountDetailPage({ params }: PageProps) {
  const { accountId } = await params;
  return (
    <div className="min-h-screen bg-fog">
      <ModuleLockProvider>
        <AccountLockGuard>
          <AccountDetail accountId={accountId} />
        </AccountLockGuard>
      </ModuleLockProvider>
    </div>
  );
}
