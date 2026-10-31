import { PageContainer, PageHeader } from "@/app/(main)/admin/_components";
import { AmapConfigClient } from "./amap-config-client";

/**
 * 高德地图配置页（RSC 壳）.
 *
 * 数据由客户端组件挂载时拉取；仅管理员可保存，运营/其他角色只读。
 */
export default function AmapConfigPage() {
  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex flex-col gap-6">
        <PageHeader
          title="高德地图"
          description="配置后台门店地图与拜访轨迹使用的高德 Web 端（JS API）Key；保存后刷新地图页生效"
        />
        <AmapConfigClient />
      </PageContainer>
    </div>
  );
}
