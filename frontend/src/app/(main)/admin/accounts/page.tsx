import { AccountsOverview } from "./_components/accounts-overview";
import { AccountLockGuard } from "./_components/lock-screen";
import { ModuleLockProvider } from "./_components/module-lock-context";

/**
 * 资金账户总览（设计稿屏 1）.
 *
 * 为什么是客户端页面：解锁令牌存 sessionStorage（关闭标签即失效），且 30 分钟滑动
 * 过期需要秒级倒计时——这些是浏览器状态，Server Component 拿不到。数据请求仍走
 * Server Actions（服务端校验令牌 + 权限），前端不直连后端。
 */
export default function AccountsPage() {
  return (
    <div className="min-h-screen bg-fog">
      <ModuleLockProvider>
        <AccountLockGuard>
          <AccountsOverview />
        </AccountLockGuard>
      </ModuleLockProvider>
    </div>
  );
}
