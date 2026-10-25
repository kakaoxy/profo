import Link from "next/link";
import { Sliders } from "lucide-react";
import { PageContainer, PageHeader } from "../_components";
import { getNotificationInitialData } from "./_lib/notifications-data";
import { NotificationList } from "./_components/notification-list";

export const metadata = {
  title: "消息中心 - ProFo",
};

/**
 * 消息中心整页（设计稿屏 03）。
 *
 * 路由权限：**故意不在 `PATH_PERMISSION_MAP` 登记**——不写条目 = 所有后台登录
 * 用户都可访问自己的消息（SPEC §8.2 ②）。
 */
export default async function NotificationsPage() {
  const { list, unread } = await getNotificationInitialData({ page: 1, page_size: 20 });

  return (
    <main className="min-h-screen bg-fog min-w-0">
      <PageContainer>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            title="消息中心"
            description="所有通知的唯一事实源。微信为 best-effort 渠道，失败不影响站内信。"
            className="mb-0"
          />
          <Link
            href="/admin/notifications/preferences"
            className="inline-flex items-center gap-1.5 rounded-inputs bg-white px-3.5 py-2 text-[13.5px] text-ink shadow-steep-sm transition-colors hover:bg-fog"
          >
            <Sliders className="h-3.5 w-3.5" aria-hidden="true" />
            偏好设置
          </Link>
        </div>

        <NotificationList initialList={list} initialUnread={unread} />

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-cards bg-white px-5 py-[18px] shadow-steep-sm">
            <p className="text-[13.5px] font-medium text-ink">渠道纪律</p>
            <p className="mt-2 text-[12.5px] leading-[1.7] text-graphite">
              站内信先落库再发微信；任何渠道失败都不得回滚业务、不得让 API 失败。
            </p>
          </div>
          <div className="rounded-cards bg-white px-5 py-[18px] shadow-steep-sm">
            <p className="text-[13.5px] font-medium text-ink">保留策略</p>
            <p className="mt-2 text-[12.5px] leading-[1.7] text-graphite">
              已读且通知创建超 180 天的收件行每日清理；未读永久保留。
            </p>
          </div>
          <div className="rounded-cards bg-white px-5 py-[18px] shadow-steep-sm">
            <p className="text-[13.5px] font-medium text-ink">隔离与幂等</p>
            <p className="mt-2 text-[12.5px] leading-[1.7] text-graphite">
              所有查询 SQL 层强制 user_id = 当前用户；他人通知一律 404，不用 403。
            </p>
          </div>
        </div>
      </PageContainer>
    </main>
  );
}
