import { redirect } from "next/navigation";

type SearchParams = Record<string, string | string[] | undefined>;

/** 将 searchParams 还原为查询串（数组参数保留重复键语义），旧链接筛选状态不丢失 */
function toQueryString(searchParams: SearchParams): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((v) => qs.append(key, v));
    } else if (value !== undefined) {
      qs.append(key, value);
    }
  }
  return qs.toString();
}

/**
 * 旧路径兼容层：/admin/recruit/campaigns → /admin/growth-center/campaigns。
 * 获客中心信息架构迁移后的服务端重定向，透传查询参数。
 */
export default async function RecruitCampaignsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const qs = toQueryString(await searchParams);
  redirect(`/admin/growth-center/campaigns${qs ? `?${qs}` : ""}`);
}
