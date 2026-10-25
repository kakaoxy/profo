import { cache } from "react";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { WorkbenchLayoutAdmin } from "./_components/workbench-layout-admin";

type RoleLayoutsResponse = components["schemas"]["WorkbenchRoleLayoutsResponse"];

export const metadata = {
  title: "工作台布局管理 - ProFo",
};

/** 服务端取角色默认布局（管理端，需 workbench:manage） */
const getRoleLayouts = cache(async (): Promise<RoleLayoutsResponse | null> => {
  const client = await fetchClient();
  try {
    const { data } = await client.GET("/api/v1/admin/workbench/role-layouts", {});
    return data ?? null;
  } catch (e) {
    if (isRedirectError(e)) throw e;
    logger.error("[WorkbenchAdmin] 角色布局获取失败:", e);
    return null;
  }
});

/**
 * 角色默认工作台布局管理（设计稿屏 05）。
 *
 * 路由权限：`/admin/settings/workbench` → `workbench:manage`（仅 admin）。
 * 该条目在 `PATH_PERMISSION_MAP` 中必须排在 `/admin/settings`（api_key:manage）之前，
 * 否则被其影子掉；见 `src/lib/auth/permissions.test.ts` 的顺序锁断言。
 */
export default async function WorkbenchLayoutPage() {
  const initial = await getRoleLayouts();

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="工作台布局管理"
          description="配置三种角色的默认工作台布局。个人覆盖优先于角色默认，但任何层级都不能授予权限。"
        />
        {initial ? (
          <WorkbenchLayoutAdmin initial={initial} />
        ) : (
          <div className="rounded-cards bg-white px-6 py-14 text-center shadow-steep-sm">
            <p className="text-[14px] font-[450] text-ink">布局配置加载失败</p>
            <p className="mt-1 text-[12.5px] text-graphite">
              需要 workbench:manage 权限（仅管理员），或稍后重试
            </p>
          </div>
        )}
      </PageContainer>
    </div>
  );
}
