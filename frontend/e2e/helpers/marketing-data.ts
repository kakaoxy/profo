import { APIRequestContext } from "@playwright/test";

/**
 * 营销房源造数/清理助手（spec §7：API 造数 → 测试 → afterAll 删除，保证可重复执行）.
 *
 * - 唯一后缀（Date.now）防并发/重复执行冲突
 * - 全部走后端 API，不污染既有数据
 */

const NOW = Date.now();

/** 造数房源标题（唯一后缀）. */
export function uniqueTitle(prefix: string): string {
  return `E2E调价-${prefix}-${NOW}`;
}

/** 造出的房源句柄. */
export interface CreatedProject {
  id: number;
  title: string;
  /** 造数初始总价（万） */
  initialPrice: number;
}

// 可选指定造数用小区 UUID（.env.example 承诺的覆盖项）；未提供时留空，
// 由 ensureCommunity 自动取库中第一个可用小区。
// 旧实现写了个从不引用的占位 UUID 常量 → E2E_COMMUNITY_ID 根根本不生效。
const COMMUNITY_ID = (process.env.E2E_COMMUNITY_ID ?? "").trim();

/**
 * 创建并发布一个营销房源.
 *
 * 注意：community_id 需为库中真实小区 UUID（优先取 E2E_COMMUNITY_ID，
 * 未提供时在 ensureCommunity 中自动取第一个可用小区）。
 */
export async function createPublishedProject(
  ctx: APIRequestContext,
  prefix: string,
  opts?: { communityId?: string; price?: number },
): Promise<CreatedProject> {
  const communityId = opts?.communityId ?? (await ensureCommunity(ctx));
  const initialPrice = opts?.price ?? 428;

  // 1. 创建（草稿）
  const createRes = await ctx.post("/api/v1/admin/marketing/projects", {
    data: {
      community_id: communityId,
      layout: "两室一厅",
      orientation: "南北",
      floor_info: "中楼层/18层",
      area: 76.5,
      total_price: initialPrice,
      title: uniqueTitle(prefix),
    },
  });
  if (!createRes.ok()) {
    throw new Error(`E2E 造数创建失败: HTTP ${createRes.status()} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: number; title: string };

  // 2. 发布
  const publishRes = await ctx.put(`/api/v1/admin/marketing/projects/${created.id}`, {
    data: { publish_status: "发布" },
  });
  if (!publishRes.ok()) {
    throw new Error(
      `E2E 造数发布失败(id=${created.id}): HTTP ${publishRes.status()} ${await publishRes.text()}`,
    );
  }

  return { id: created.id, title: created.title, initialPrice };
}

/** 创建一个草稿房源（不发布）. */
export async function createDraftProject(
  ctx: APIRequestContext,
  prefix: string,
  opts?: { communityId?: string },
): Promise<CreatedProject> {
  const communityId = opts?.communityId ?? (await ensureCommunity(ctx));
  const createRes = await ctx.post("/api/v1/admin/marketing/projects", {
    data: {
      community_id: communityId,
      layout: "一室一厅",
      orientation: "北",
      floor_info: "高楼层/6层",
      area: 45,
      total_price: 268,
      title: uniqueTitle(prefix),
    },
  });
  if (!createRes.ok()) {
    throw new Error(`E2E 造数草稿失败: HTTP ${createRes.status()} ${await createRes.text()}`);
  }
  const created = (await createRes.json()) as { id: number; title: string };
  return { id: created.id, title: created.title, initialPrice: 268 };
}

/** 调价（API 直发，PUT exclude_unset 局部更新）. */
export async function changePrice(
  ctx: APIRequestContext,
  projectId: number,
  price: number,
): Promise<void> {
  const res = await ctx.put(`/api/v1/admin/marketing/projects/${projectId}`, {
    data: { total_price: price },
  });
  if (!res.ok()) {
    throw new Error(`E2E 调价失败(id=${projectId}): HTTP ${res.status()} ${await res.text()}`);
  }
}

/** 查询调价历史条数（E2E-3 同值回归断言用）. */
export async function getPriceChangeCount(
  ctx: APIRequestContext,
  projectId: number,
): Promise<number> {
  const res = await ctx.get(`/api/v1/admin/marketing/projects/${projectId}/price-changes`);
  if (!res.ok()) {
    throw new Error(`E2E 查时间线失败(id=${projectId}): HTTP ${res.status()}`);
  }
  return ((await res.json()) as { total: number }).total;
}

/** 删除房源（清理；幂等——已删除返回 404 视为成功）. */
export async function deleteProject(
  ctx: APIRequestContext,
  projectId: number,
): Promise<void> {
  const res = await ctx.delete(`/api/v1/admin/marketing/projects/${projectId}`);
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`E2E 清理删除失败(id=${projectId}): HTTP ${res.status()}`);
  }
}

let cachedCommunityId: string | null = null;

/** 取造数用小区 UUID：优先 E2E_COMMUNITY_ID，否则取库中第一个（进程内缓存）. */
async function ensureCommunity(ctx: APIRequestContext): Promise<string> {
  if (cachedCommunityId) return cachedCommunityId;
  // 环境变量显指定 → 直接使用（不查库，也不被库中无小区的环境影响）
  if (COMMUNITY_ID) {
    cachedCommunityId = COMMUNITY_ID;
    return cachedCommunityId;
  }
  const res = await ctx.get("/api/v1/admin/communities?page=1&page_size=1");
  if (!res.ok()) {
    throw new Error(`E2E 查询小区失败: HTTP ${res.status()}`);
  }
  const body = (await res.json()) as { items?: { id: string }[] };
  const first = body.items?.[0];
  if (!first?.id) {
    throw new Error("E2E 造数失败：库中无可用小区，请先创建小区或设置 E2E_COMMUNITY_ID");
  }
  cachedCommunityId = first.id;
  return cachedCommunityId;
}
