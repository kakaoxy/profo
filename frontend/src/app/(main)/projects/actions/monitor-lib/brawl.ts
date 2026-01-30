"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { BrawlItem, PropertyItem } from "./types";
import { getCompetitorsAction } from "./competitors";
import { extractPaginatedData } from "@/lib/api-helpers";

/**
 * 获取竞品肉搏战数据
 * 聚合项目所在小区和竞品小区的房源
 */
export async function getCompetitorsBrawlAction(projectId: string) {
  try {
    // 1. 获取项目详情
    const projectResult = await getProjectDetailAction(projectId, true);
    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }
    const project = projectResult.data;

    // 2. 获取竞品小区
    const competitorsResult = await getCompetitorsAction(projectId);
    const competitorCommunities =
      competitorsResult.success && competitorsResult.data
        ? competitorsResult.data.map((c) => c.community_name)
        : [];

    // 目标小区列表 (包含本项目小区)
    const targetCommunities = [
      project.community_name,
      ...competitorCommunities,
    ].filter(Boolean);
    const uniqueCommunities = Array.from(new Set(targetCommunities));

    const client = await fetchClient();

    // 3. 并行获取各个小区的数据
    // 为了支持前端自由筛选，我们一次性获取"在售"和"成交"的最近数据
    // 限制前5个小区，每个状态取前10条
    const communitiesToFetch = uniqueCommunities.slice(0, 5);

    // 初始化结果容器
    let allItems: BrawlItem[] = [];
    let countOnSale = 0;
    let countSold = 0;

    // 并行执行所有请求
    const promises = communitiesToFetch.map(async (communityName) => {
      // 请求1: 获取在售列表
      const onSalePromise = client.GET("/api/v1/properties", {
        params: {
          query: {
            community_name: communityName,
            status: "在售",
            page_size: 10,
            sort_by: "listed_date",
            sort_order: "desc",
          },
        },
      });

      // 请求2: 获取成交列表
      const soldPromise = client.GET("/api/v1/properties", {
        params: {
          query: {
            community_name: communityName,
            status: "成交",
            page_size: 10,
            sort_by: "sold_date",
            sort_order: "desc",
          },
        },
      });

      const [onSaleRes, soldRes] = await Promise.all([
        onSalePromise,
        soldPromise,
      ]);

      const onSaleData = extractPaginatedData<PropertyItem>(onSaleRes.data);
      const soldData = extractPaginatedData<PropertyItem>(soldRes.data);

      return {
        communityName,
        onSaleData,
        soldData,
      };
    });

    const results = await Promise.all(promises);

    // 4. 处理结果
    for (const res of results) {
      // 处理在售数据
      if (res.onSaleData) {
        const data = res.onSaleData;
        countOnSale += data.total || 0;

        const items = (data.items || []).map((p: PropertyItem) => ({
          id: String(p.id),
          community: p.community_name || "",
          status: "on_sale", // 统一标识为 on_sale，前端显示时再映射为中文
          display_status: p.status, //原本的中文状态
          layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
          floor: p.floor_display || p.floor_level || "-",
          area: p.build_area || 0,
          total:
            p.total_price ||
            Math.round(((p.unit_price || 0) * (p.build_area || 0)) / 10000),
          unit: p.unit_price || 0,
          date:
            p.listed_date?.split("T")[0] || p.updated_at?.split("T")[0] || "-",
          source: p.data_source || "未知",
        }));
        allItems = [...allItems, ...items];
      }

      // 处理成交数据
      if (res.soldData) {
        const data = res.soldData;
        countSold += data.total || 0;

        const items = (data.items || []).map((p: PropertyItem) => ({
          id: String(p.id),
          community: p.community_name || "",
          status: "sold", // 统一标识为 sold
          display_status: p.status,
          layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
          floor: p.floor_display || p.floor_level || "-",
          area: p.build_area || 0,
          total:
            p.total_price ||
            Math.round(((p.unit_price || 0) * (p.build_area || 0)) / 10000),
          unit: p.unit_price || 0,
          date:
            p.sold_date?.split("T")[0] || p.updated_at?.split("T")[0] || "-",
          source: p.data_source || "未知",
        }));
        allItems = [...allItems, ...items];
      }
    }

    // 5. 注入"本项目" (如果项目没卖出)
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
        layout: "-", // 本项目没有户型数据，移除显示
        floor: "中楼层", // ProjectResponse 没有 floor_display 字段
        area: area,
        total: listPrice,
        unit: unitPrice,
        date: new Date().toISOString().split("T")[0],
        source: "内部",
        is_current: true,
      };
      allItems.unshift(projectItem);
      countOnSale += 1;
    }

    // 6. 统一排序 (时间倒序)
    allItems.sort((a, b) => {
      // 优先显示 is_current
      if (a.is_current) return -1;
      if (b.is_current) return 1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    return {
      success: true,
      data: {
        items: allItems,
        counts: {
          on_sale: countOnSale,
          sold: countSold,
        },
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
  // Basic implementation for viewing by community.
  // Does NOT include competitors since we don't know who they are without a project definition.
  // Does NOT include "My Project" injection.

  try {
    const client = await fetchClient();
    const uniqueCommunities = [communityName];

    // 初始化结果容器
    let allItems: BrawlItem[] = [];
    let countOnSale = 0;
    let countSold = 0;

    // 并行执行所有请求
    const promises = uniqueCommunities.map(async (name) => {
      // 请求1: 获取在售列表
      const onSalePromise = client.GET("/api/v1/properties", {
        params: {
          query: {
            community_name: name,
            status: "在售",
            page_size: 10,
            sort_by: "listed_date",
            sort_order: "desc",
          },
        },
      });

      // 请求2: 获取成交列表
      const soldPromise = client.GET("/api/v1/properties", {
        params: {
          query: {
            community_name: name,
            status: "成交",
            page_size: 10,
            sort_by: "sold_date",
            sort_order: "desc",
          },
        },
      });

      const [onSaleRes, soldRes] = await Promise.all([
        onSalePromise,
        soldPromise,
      ]);

      const onSaleData = extractPaginatedData<PropertyItem>(onSaleRes.data);
      const soldData = extractPaginatedData<PropertyItem>(soldRes.data);

      return {
        communityName: name,
        onSaleData,
        soldData,
      };
    });

    const results = await Promise.all(promises);

    // 处理结果
    for (const res of results) {
      if (res.onSaleData) {
        const data = res.onSaleData;
        countOnSale += data.total || 0;

        const items = (data.items || []).map((p: PropertyItem) => ({
          id: String(p.id),
          community: p.community_name || "",
          status: "on_sale",
          display_status: p.status,
          layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
          floor: p.floor_display || p.floor_level || "-",
          area: p.build_area || 0,
          total:
            p.total_price ||
            Math.round(((p.unit_price || 0) * (p.build_area || 0)) / 10000),
          unit: p.unit_price || 0,
          date:
            p.listed_date?.split("T")[0] || p.updated_at?.split("T")[0] || "-",
          source: p.data_source || "未知",
        }));
        allItems = [...allItems, ...items];
      }

      if (res.soldData) {
        const data = res.soldData;
        countSold += data.total || 0;

        const items = (data.items || []).map((p: PropertyItem) => ({
          id: String(p.id),
          community: p.community_name || "",
          status: "sold",
          display_status: p.status,
          layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
          floor: p.floor_display || p.floor_level || "-",
          area: p.build_area || 0,
          total:
            p.total_price ||
            Math.round(((p.unit_price || 0) * (p.build_area || 0)) / 10000),
          unit: p.unit_price || 0,
          date:
            p.sold_date?.split("T")[0] || p.updated_at?.split("T")[0] || "-",
          source: p.data_source || "未知",
        }));
        allItems = [...allItems, ...items];
      }
    }

    // 统一排序 (时间倒序)
    allItems.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );

    return {
      success: true,
      data: {
        items: allItems,
        counts: {
          on_sale: countOnSale,
          sold: countSold,
        },
      },
    };
  } catch (e) {
    console.error("获取竞品肉搏战异常:", e);
    return { success: false, message: "网络错误" };
  }
}
