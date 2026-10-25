import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageContainer, PageHeader } from "../../_components";
import { getNotificationPreferences } from "../_lib/notifications-data";
import { PreferenceForm } from "../_components/preference-form";

export const metadata = {
  title: "消息偏好 - ProFo",
};

/**
 * 消息偏好页（设计稿屏 04）。
 *
 * 路由权限：与消息中心一样**故意不登记** `PATH_PERMISSION_MAP`，
 * 所有后台登录用户都能配置自己的偏好（SPEC §8.2 ②）。
 */
export default async function NotificationPreferencesPage() {
  const prefs = await getNotificationPreferences();

  return (
    <main className="min-h-screen bg-fog min-w-0">
      <PageContainer>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            title="消息偏好"
            description="按「分类 × 渠道」两级开关。默认全开，与现状行为保持一致。"
            className="mb-0"
          />
          <Link
            href="/admin/notifications"
            className="inline-flex items-center gap-1 rounded-inputs bg-white px-3.5 py-2 text-[13.5px] text-ink shadow-steep-sm transition-colors hover:bg-fog"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            返回消息中心
          </Link>
        </div>

        {prefs ? (
          <PreferenceForm initial={prefs} />
        ) : (
          <div className="rounded-cards bg-white px-6 py-14 text-center shadow-steep-sm">
            <p className="text-[14px] font-[450] text-ink">偏好加载失败</p>
            <p className="mt-1 text-[12.5px] text-graphite">请刷新页面重试</p>
          </div>
        )}
      </PageContainer>
    </main>
  );
}
