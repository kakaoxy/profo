import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { DictManageClient } from "./dict-manage-client";

/**
 * 业务字典配置页（RSC 壳）.
 *
 * 布局与页头在服务端渲染（`admin/_components` 的 dashboard wrapper 依赖
 * `next/headers`，客户端组件不得直接引用该 barrel）；数据由客户端组件挂载时
 * 经 openapi-fetch 拉取（配置类页面无需 SSR 首屏取数）。
 * 权限：路由级 `PATH_PERMISSION_MAP`（dict:manage）+ 后端 `DictManagePermDep` 双重校验。
 */
export default function DictSettingsPage() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="业务字典"
          description="运营可配枚举字典：改展示名/排序/停用即时生效（公开端点缓存 ≤60s），历史单据按存储值原样展示"
        />
        <DictManageClient />
      </PageContainer>
    </div>
  );
}
