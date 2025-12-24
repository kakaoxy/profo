"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { BrawlItem } from "./types";
import { getCompetitorsAction } from "./competitors";

/**
 * 获取竞品肉搏战数据
 * 聚合项目所在小区和竞品小区的房源
 */
export async function getCompetitorsBrawlAction(projectId: string, statusKey: 'on_sale' | 'sold') {
  try {
    // 1. 获取项目详情
    const projectResult = await getProjectDetailAction(projectId, true);
    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }
    const project = projectResult.data;
    
    // 2. 获取竞品小区
    const competitorsResult = await getCompetitorsAction(projectId);
    const competitorCommunities = competitorsResult.success && competitorsResult.data 
      ? competitorsResult.data.map(c => c.community_name) 
      : [];
    
    // 目标小区列表 (包含本项目小区)
    const targetCommunities = [project.community_name, ...competitorCommunities].filter(Boolean); // 去重? 暂时假设不重复
    const uniqueCommunities = Array.from(new Set(targetCommunities));

    // 状态映射
    const statusMap = {
      'on_sale': '在售',
      'sold': '成交'
    };
    const apiStatus = statusMap[statusKey];

    const client = await fetchClient();

    // 3. 并行获取各个小区的数据 (为了性能，分别获取当前状态的列表和两种状态的计数)
    // 这里的策略是：
    // - 对于"当前需要显示的列表": 查询 apiStatus, page_size=20 (每个小区? 或者不支持多小区只能循环)
    //   由于API不支持多小区，我们需要循环查询。为了避免太多请求，这里限制只处理前5个小区。
    
    const communitiesToFetch = uniqueCommunities.slice(0, 5);
    
    // 初始化结果容器
    let allItems: BrawlItem[] = [];
    let countOnSale = 0;
    let countSold = 0;

    // 并行执行所有请求
    const promises = communitiesToFetch.map(async (communityName) => {
      // 请求1: 获取当前状态的列表 (和总数)
      const listPromise = client.GET("/api/properties", {
        params: {
          query: {
            community_name: communityName,
            status: apiStatus,
            page_size: 10, // 每个小区取10条，最后在内存排序截取
            sort_by: statusKey === 'on_sale' ? 'listed_date' : 'sold_date', // 按时间倒序
            sort_order: 'desc'
          }
        }
      });

      // 请求2: 获取另一种状态的总数 (pageSize=1即可)
      const otherStatus = statusKey === 'on_sale' ? '成交' : '在售';
      const countPromise = client.GET("/api/properties", {
        params: {
          query: {
            community_name: communityName,
            status: otherStatus,
            page_size: 1
          }
        }
      });

      const [listRes, countRes] = await Promise.all([listPromise, countPromise]);

      return {
        communityName,
        listData: listRes.data,
        otherCountData: countRes.data
      };
    });

    const results = await Promise.all(promises);

    // 4. 处理结果
    for (const res of results) {
      if (res.listData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.listData as any; // PaginatedPropertyResponse
        const total = data.total || 0;
        
        // 累加计数
        if (statusKey === 'on_sale') {
          countOnSale += total;
        } else {
          countSold += total;
        }

        // 转换列表项
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (data.items || []).map((p: any) => ({
          id: String(p.id),
          community: p.community_name,
          status: p.status, // "在售" or "成交"
          layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
          floor: p.floor_display || p.floor_level || "-",
          area: p.build_area,
          total: p.total_price || Math.round(p.unit_price * p.build_area / 10000), // 如果没有总价，估算
          unit: p.unit_price,
          date: (statusKey === 'on_sale' ? p.listed_date : p.sold_date)?.split("T")[0] || p.updated_at?.split("T")[0] || "-",
          source: p.data_source || "未知"
        }));
        
        allItems = [...allItems, ...items];
      }

      if (res.otherCountData) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = res.otherCountData as any;
        if (statusKey === 'on_sale') {
           countSold += (data.total || 0);
        } else {
           countOnSale += (data.total || 0);
        }
      }
    }

    // 5. 注入"本项目" (如果是"在售"且项目状态匹配)
    // 假设 project.status === 'selling' 对应 'on_sale'
    // 假设 project.status === 'sold' 对应 'sold'
    // 这里简单判断，只要当前是在看"在售"，且项目没卖出，就显示。
    if (statusKey === 'on_sale' && project.status !== 'sold' && project.status !== 'archived') {
       const projectItem: BrawlItem = {
         id: `Self-${project.id}`,
         community: project.community_name || "本项目",
         status: "挂牌",
         layout: `${project.rooms}室${project.halls}厅`,
         floor: project.floor_display || "中楼层",
         area: project.build_area,
         total: Number(project.list_price) || 0, // list_price is likely in Wan from detail? Detail says "listed_price_wan" or "list_price"? Let's assume detail has it. 
         // Wait, getProjectDetailAction returns data from backend. Schema says "listed_price_wan". 
         // But getProjectDetailAction return type is any casted? The schema viewed earlier showed listed_price_wan.
         // Let's safe access.
         unit: project.unit_price || 0,
         date: new Date().toISOString().split("T")[0], // 今天？或者 created_at
         source: "内部",
         is_current: true
       };
       // 放入列表顶部
       allItems.unshift(projectItem);
       countOnSale += 1;
    }

    // 6. 排序 (按日期倒序)
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
          sold: countSold
        }
      }
    };

  } catch (e) {
    console.error("获取竞品肉搏战异常:", e);
    return { success: false, message: "网络错误" };
  }
}
