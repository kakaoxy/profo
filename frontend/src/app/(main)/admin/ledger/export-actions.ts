"use server";

import { getAccessTokenFromCookie } from "@/lib/token-refresh-server";
import { getApiUrl } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { ActionResult } from "./actions";

export interface LedgerExportParams {
  search?: string;
  project_status?: string;
}

/**
 * 导出资金账本 Excel（返回 ArrayBuffer，客户端转 Blob 下载）
 *
 * 注：导出端点返回二进制流，openapi-fetch 不便处理 Blob，故保留裸 fetch。
 */
export async function exportLedger(
  params: LedgerExportParams = {},
): Promise<ActionResult<ArrayBuffer>> {
  try {
    const token = await getAccessTokenFromCookie();
    // 鉴权守卫：token 缺失时直接拒绝，避免发送无 Authorization 头的请求
    if (!token) {
      return { success: false, message: "未登录或会话已过期，请重新登录" };
    }
    const url = new URL(getApiUrl("/api/v1/admin/ledger/export"));
    if (params.search && params.search.trim()) {
      url.searchParams.set("search", params.search.trim());
    }
    if (params.project_status && params.project_status !== "all") {
      url.searchParams.set("project_status", params.project_status);
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const msg = `导出失败 (HTTP ${res.status})`;
      return { success: false, message: msg };
    }

    const buffer = await res.arrayBuffer();
    return { success: true, data: buffer };
  } catch (e) {
    logger.error("导出资金账本异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 导出单项目资金账本为 zip（含流水 CSV + 票据图片，返回 ArrayBuffer）
 *
 * 注：导出端点返回二进制流，openapi-fetch 不便处理 Blob，故保留裸 fetch。
 */
export async function exportProjectLedger(projectId: string): Promise<ActionResult<ArrayBuffer>> {
  try {
    // 防御性校验：projectId 必须为 UUID，避免路径注入/SSRF
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      return { success: false, message: "无效的项目ID" };
    }
    const token = await getAccessTokenFromCookie();
    // 鉴权守卫：token 缺失时直接拒绝，避免发送无 Authorization 头的请求
    if (!token) {
      return { success: false, message: "未登录或会话已过期，请重新登录" };
    }
    const url = new URL(getApiUrl(`/api/v1/admin/ledger/${projectId}/export`));

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const msg = `导出失败 (HTTP ${res.status})`;
      return { success: false, message: msg };
    }

    const buffer = await res.arrayBuffer();
    return { success: true, data: buffer };
  } catch (e) {
    logger.error("导出项目资金账本异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
