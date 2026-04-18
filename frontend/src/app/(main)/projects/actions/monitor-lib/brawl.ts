"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { BrawlItem, PropertyItem } from "./types";
import { getCompetitorsAction } from "./competitors";
import { extractPaginatedData } from "@/lib/api-helpers";

function mapPropertyToBrawlItem(
  p: PropertyItem,
  status: "on_sale" | "sold",
): BrawlItem {
  const isOnSale = status === "on_sale";
  return {
    id: String(p.id),
    community: p.community_name || "",
    status,
    display_status: p.status,
    layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
    floor: p.floor_display || p.floor_level || "-",
    area: p.build_area || 0,
    total:
      p.total_price ||
      Math.round(((p.unit_price || 0) * (p.build_area || 0)) / 10000),
    unit: p.unit_price || 0,
    date:
      (isOnSale
        ? p.listed_date?.split("T")[0]
        : p.sold_date?.split("T")[0]) ||
      p.updated_at?.split("T")[0] ||
      "-",
    source: p.data_source || "未知",
  };
}

interface CommunityDataResult {
  items: BrawlItem[];
  countOnSale: number;
  countSold: number;
}

async function fetchCommunityData(
  client: Awaited<ReturnType<typeof fetchClient>>,
  communityName: string,
): Promise<CommunityDataResult> {
  const [onSaleRes, soldRes] = await Promise.all([
    client.GET("/api/v1/properties", {
      params: {
        query: {
          community_name: communityName,
          status: "在售",
          page_size: 10,
          sort_by: "listed_date",
          sort_order: "desc",
        },
      },
    }),
    client.GET("/api/v1/properties", {
      params: {
        query: {
          community_name: communityName,
          status: "成交",
          page_size: 10,
          sort_by: "sold_date",
          sort_order: "desc",
        },
      },
    }),
  ]);

  const onSaleData = extractPaginatedData<PropertyItem>(onSaleRes.data);
  const soldData = extractPaginatedData<PropertyItem>(soldRes.data);

  const items: BrawlItem[] = [];
  let countOnSale = 0;
  let countSold = 0;

  if (onSaleData) {
    countOnSale = onSaleData.total || 0;
    items.push(
      ...(onSaleData.items || []).map((p) =>
        mapPropertyToBrawlItem(p, "on_sale"),
      ),
    );
  }

  if (soldData) {
    countSold = soldData.total || 0;
    items.push(
      ...(soldData.items || []).map((p) => mapPropertyToBrawlItem(p, "sold")),
    );
  }

  return { items, countOnSale, countSold };
}

export async function getCompetitorsBrawlAction(projectId: string) {
  try {
    const [projectResult, competitorsResult] = await Promise.all([
      getProjectDetailAction(projectId, true),
      getCompetitorsAction(projectId),
    ]);

    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }
    const project = projectResult.data;

    const competitorCommunities =
      competitorsResult.success && competitorsResult.data
        ? competitorsResult.data.map((c) => c.community_name)
        : [];

    const targetCommunities = [
      project.community_name,
      ...competitorCommunities,
    ].filter((name): name is string => Boolean(name));
    const uniqueCommunities = Array.from(new Set(targetCommunities)).slice(
      0,
      5,
    );

    const client = await fetchClient();

    const results = await Promise.all(
      uniqueCommunities.map((name) => fetchCommunityData(client, name)),
    );

    const allItems: BrawlItem[] = [];
    let countOnSale = 0;
    let countSold = 0;

    for (const res of results) {
      allItems.push(...res.items);
      countOnSale += res.countOnSale;
      countSold += res.countSold;
    }

    if (project.status !== "sold" && project.status !== "archived") {
      const area = project.area ? Number(project.area) : 0;
      const listPrice = project.list_price
        ? Number(project.list_price)
        : project.signing_price
          ? Number(project.signing_price)
          : 0;
      const unitPrice =
        area > 0 && listPrice > 0 ? Math.round((listPrice * 10000) / area) : 0;

      const projectItem: BrawlItem = {
        id: `Self-${project.id}`,
        community: project.community_name || "本项目",
        status: "on_sale",
        display_status: "挂牌",
        layout: "-",
        floor: "中楼层",
        area,
        total: listPrice,
        unit: unitPrice,
        date: new Date().toISOString().split("T")[0],
        source: "内部",
        is_current: true,
      };
      allItems.unshift(projectItem);
      countOnSale += 1;
    }

    allItems.sort((a, b) => {
      if (a.is_current) return -1;
      if (b.is_current) return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return {
      success: true,
      data: {
        items: allItems,
        counts: { on_sale: countOnSale, sold: countSold },
      },
    };
  } catch (e) {
    console.error("获取竞品肉搏战异常:", e);
    return { success: false, message: "网络错误" };
  }
}

export async function getCompetitorsBrawlByCommunityAction(
  communityName: string,
) {
  try {
    const client = await fetchClient();
    const { items, countOnSale, countSold } = await fetchCommunityData(
      client,
      communityName,
    );

    items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return {
      success: true,
      data: {
        items,
        counts: { on_sale: countOnSale, sold: countSold },
      },
    };
  } catch (e) {
    console.error("获取竞品肉搏战异常:", e);
    return { success: false, message: "网络错误" };
  }
}
