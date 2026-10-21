"use server";

/**
 * 资金账户模块 Server Actions.
 *
 * 与 `admin/ledger/actions.ts` 同一形态：Zod 校验 → openapi-fetch 调后端 →
 * revalidatePath 刷新受影响的页面 → 返回 `ActionResult`。
 *
 * 解锁令牌不落 cookie（避免与登录态混淆、也避免被 CSRF 面放大）：前端存
 * sessionStorage，每次调用显式传入，服务端转成 `X-Accounts-Unlock` 请求头。
 */

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { extractErrorMessage, type ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";
import type { components, paths } from "@/lib/api-types";
import {
  accountCreateSchema,
  accountUpdateSchema,
  adjustmentCreateSchema,
  modulePasswordSchema,
  unlockSchema,
} from "./_components/account-schema";

type FundAccountResponse = components["schemas"]["FundAccountResponse"];
type FundAccountListResponse = components["schemas"]["FundAccountListResponse"];
type FundAccountSummaryResponse = components["schemas"]["FundAccountSummaryResponse"];
type FundAccountLockStateResponse = components["schemas"]["FundAccountLockStateResponse"];
type FundAccountUnlockResponse = components["schemas"]["FundAccountUnlockResponse"];
type FundAdjustmentResponse = components["schemas"]["FundAdjustmentResponse"];
type FundFlowListResponse = components["schemas"]["FundFlowListResponse"];

/** 解锁令牌请求头（与 backend dependencies/auth.py::ACCOUNTS_UNLOCK_HEADER 一致） */
const UNLOCK_HEADER = "X-Accounts-Unlock";

type AccountListQuery = NonNullable<paths["/api/v1/admin/accounts"]["get"]["parameters"]["query"]>;
type FlowListQuery = NonNullable<
  paths["/api/v1/admin/accounts/flows"]["get"]["parameters"]["query"]
>;

/** 统一的账户请求参数：令牌可选（lock-state 等端点不需要） */
interface TokenOptions {
  token?: string | null;
}

function headersOf(token?: string | null): Record<string, string> {
  return token ? { [UNLOCK_HEADER]: token } : {};
}

/**
 * 把 openapi-fetch 的错误体转成 ActionResult，并保留服务端 ``code``。
 *
 * 为何要带 code（2026-10-22 缺陷修复）：模块解锁令牌可能被**另一个标签页**锁定、
 * 或服务端 30 分钟滑到过期、或被管理员重设密码后失效。这些情况下受保护请求统一
 * 返回 403，但前端此前只弹一个 toast，锁屏守卫仍以为「已解锁」继续渲染旧数据，
 * 直到用户手动点「锁定」。带上 code 后由调用方对 403 调 ``invalidate()``，
 * 立即回到锁屏。
 */
function errorResult(
  error: unknown,
  fallback: string,
): { success: false; error: string; code?: string } {
  const raw = (error as { code?: unknown } | null)?.code;
  const code = raw === undefined || raw === null ? undefined : String(raw);
  return { success: false, error: extractErrorMessage(error, fallback), code };
}

// ─── 读取 ────────────────────────────────────────────────────────────────────

export async function fetchAccounts(
  params: AccountListQuery = {},
  { token }: TokenOptions = {},
): Promise<ActionResult<FundAccountListResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts", {
      params: { query: params },
      headers: headersOf(token),
    });
    if (error) return errorResult(error, "获取账户列表失败");
    return { success: true, data: extractApiData<FundAccountListResponse>(data) };
  } catch (e) {
    logger.error("获取资金账户列表异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 获取记账用的账户选项（**不含余额**，无需模块解锁）.
 *
 * 与 `fetchAccounts` 的区别：这里只返回 id/名称/类型/卡号，供「记一笔」弹窗选账户。
 * 余额属于解锁后信息，必须走 `fetchAccounts`（服务端 require_accounts_unlock 把关）。
 */
export async function fetchAccountOptions(): Promise<
  ActionResult<components["schemas"]["FundAccountOptionListResponse"]>
> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts/options");
    if (error) return { success: false, error: extractErrorMessage(error, "获取账户列表失败") };
    return {
      success: true,
      data: extractApiData<components["schemas"]["FundAccountOptionListResponse"]>(data),
    };
  } catch (e) {
    logger.error("获取资金账户选项异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function fetchAccountsSummary(
  { token }: TokenOptions = {},
): Promise<ActionResult<FundAccountSummaryResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts/summary", {
      headers: headersOf(token),
    });
    if (error) return errorResult(error, "获取账户总览失败");
    return { success: true, data: extractApiData<FundAccountSummaryResponse>(data) };
  } catch (e) {
    logger.error("获取资金账户总览异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function fetchAccount(
  accountId: string,
  { token }: TokenOptions = {},
): Promise<ActionResult<FundAccountResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts/{account_id}", {
      params: { path: { account_id: accountId } },
      headers: headersOf(token),
    });
    if (error) return errorResult(error, "获取账户详情失败");
    return { success: true, data: extractApiData<FundAccountResponse>(data) };
  } catch (e) {
    logger.error("获取资金账户详情异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function fetchAccountFlows(
  params: FlowListQuery = {},
  { token }: TokenOptions = {},
): Promise<ActionResult<FundFlowListResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts/flows", {
      params: { query: params },
      headers: headersOf(token),
    });
    if (error) return errorResult(error, "获取账户流水失败");
    return { success: true, data: extractApiData<FundFlowListResponse>(data) };
  } catch (e) {
    logger.error("获取账户流水异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function fetchAccountAdjustments(
  accountId: string,
  { token }: TokenOptions = {},
): Promise<ActionResult<FundAdjustmentResponse[]>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts/{account_id}/adjustments", {
      params: { path: { account_id: accountId } },
      headers: headersOf(token),
    });
    if (error) return errorResult(error, "获取对账记录失败");
    return { success: true, data: extractApiData<FundAdjustmentResponse[]>(data) ?? [] };
  } catch (e) {
    logger.error("获取对账记录异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

// ─── 模块锁 ──────────────────────────────────────────────────────────────────

export async function fetchLockState(
  { token }: TokenOptions = {},
): Promise<ActionResult<FundAccountLockStateResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/accounts/lock-state", {
      headers: headersOf(token),
    });
    if (error) return { success: false, error: extractErrorMessage(error, "获取锁状态失败") };
    return { success: true, data: extractApiData<FundAccountLockStateResponse>(data) };
  } catch (e) {
    logger.error("获取资金账户锁状态异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function unlockAccounts(
  password: string,
): Promise<ActionResult<FundAccountUnlockResponse>> {
  const parsed = unlockSchema.safeParse({ password });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "密码格式不正确" };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/admin/accounts/unlock", {
      body: parsed.data,
    });
    if (error) return { success: false, error: extractErrorMessage(error, "解锁失败") };
    return { success: true, data: extractApiData<FundAccountUnlockResponse>(data) };
  } catch (e) {
    logger.error("资金账户解锁异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function lockAccounts(token: string | null): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/admin/accounts/lock", {
      headers: headersOf(token),
    });
    if (error) return { success: false, error: extractErrorMessage(error, "锁定失败") };
    revalidatePath("/admin/accounts");
    return { success: true, data: null };
  } catch (e) {
    logger.error("锁定资金账户异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function setModulePassword(
  newPassword: string,
  oldPassword?: string,
): Promise<ActionResult<null>> {
  const parsed = modulePasswordSchema.safeParse({
    new_password: newPassword,
    old_password: oldPassword ?? null,
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "密码格式不正确" };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.POST("/api/v1/admin/accounts/module-password", {
      body: parsed.data,
    });
    if (error) return { success: false, error: extractErrorMessage(error, "设置密码失败") };
    revalidatePath("/admin/accounts");
    return { success: true, data: null };
  } catch (e) {
    logger.error("设置资金账户密码异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

// ─── 写入 ────────────────────────────────────────────────────────────────────

export async function createAccount(
  input: unknown,
  token: string | null,
): Promise<ActionResult<FundAccountResponse>> {
  const parsed = accountCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "账户参数不合法" };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/admin/accounts", {
      body: parsed.data,
      headers: headersOf(token),
    });
    if (error) return { success: false, error: extractErrorMessage(error, "新建账户失败") };
    revalidatePath("/admin/accounts");
    return { success: true, data: extractApiData<FundAccountResponse>(data) };
  } catch (e) {
    logger.error("新建资金账户异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function updateAccount(
  accountId: string,
  input: unknown,
  token: string | null,
): Promise<ActionResult<FundAccountResponse>> {
  const parsed = accountUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "账户参数不合法" };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.PATCH("/api/v1/admin/accounts/{account_id}", {
      params: { path: { account_id: accountId } },
      body: parsed.data,
      headers: headersOf(token),
    });
    if (error) return { success: false, error: extractErrorMessage(error, "保存账户失败") };
    revalidatePath("/admin/accounts");
    revalidatePath(`/admin/accounts/${accountId}`);
    return { success: true, data: extractApiData<FundAccountResponse>(data) };
  } catch (e) {
    logger.error("更新资金账户异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function deleteAccount(
  accountId: string,
  token: string | null,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/admin/accounts/{account_id}", {
      params: { path: { account_id: accountId } },
      headers: headersOf(token),
    });
    if (error) return { success: false, error: extractErrorMessage(error, "删除账户失败") };
    revalidatePath("/admin/accounts");
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除资金账户异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

export async function createAdjustment(
  accountId: string,
  input: unknown,
  token: string | null,
): Promise<ActionResult<FundAdjustmentResponse>> {
  const parsed = adjustmentCreateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "对账参数不合法" };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/accounts/{account_id}/adjustments",
      {
        params: { path: { account_id: accountId } },
        body: parsed.data,
        headers: headersOf(token),
      },
    );
    if (error) return { success: false, error: extractErrorMessage(error, "对账失败") };
    revalidatePath("/admin/accounts");
    revalidatePath(`/admin/accounts/${accountId}`);
    return { success: true, data: extractApiData<FundAdjustmentResponse>(data) };
  } catch (e) {
    logger.error("资金账户对账异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 为余额核对调整补传凭证（**仅追加**，金额/原因/日期不可改）.
 *
 * 约束来源：调整记录「只加不改不删」，唯一允许的后续修改是补凭证（附件事后才拿到，
 * 不改变任何金额语义）。
 */
export async function appendAdjustmentReceipts(
  accountId: string,
  adjustmentId: string,
  receiptUrls: string[],
  token: string | null,
): Promise<ActionResult<FundAdjustmentResponse>> {
  if (receiptUrls.length === 0) {
    return { success: false, error: "请先上传凭证" };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.PATCH(
      "/api/v1/admin/accounts/{account_id}/adjustments/{adjustment_id}/receipts",
      {
        params: { path: { account_id: accountId, adjustment_id: adjustmentId } },
        body: { receipt_urls: receiptUrls },
        headers: headersOf(token),
      },
    );
    if (error) return { success: false, error: extractErrorMessage(error, "补传凭证失败") };
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/accounts/flows");
    revalidatePath(`/admin/accounts/${accountId}`);
    return { success: true, data: extractApiData<FundAdjustmentResponse>(data) };
  } catch (e) {
    logger.error("补传核对调整凭证异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 为**项目记账流水**补传凭证（追加语义，走项目账本 PATCH 端点）.
 *
 * 与「核对调整补凭证」分开的原因：两者数据落点不同（finance_records vs
 * fund_account_adjustments），接口也不同。放在本模块是为了让账户流水页
 * 只依赖自己的 actions，不去跨模块 import 账本的 action（避免循环/耦合）。
 */
export async function appendRecordReceipts(
  recordId: string,
  receiptUrls: string[],
): Promise<ActionResult<null>> {
  if (receiptUrls.length === 0) {
    return { success: false, error: "请先上传凭证" };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.PATCH("/api/v1/admin/ledger/{record_id}", {
      params: { path: { record_id: recordId } },
      body: { receipt_urls: receiptUrls },
    });
    if (error) return { success: false, error: extractErrorMessage(error, "补传凭证失败") };
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/accounts/flows");
    revalidatePath("/admin/ledger");
    return { success: true, data: null };
  } catch (e) {
    logger.error("为记账流水补传凭证异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

// ─── 记账联动：补挂/换挂账户 ─────────────────────────────────────────────────

export async function fixRecordAccount(
  recordId: string,
  accountId: string | null,
  skipped = false,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.PATCH("/api/v1/admin/ledger/{record_id}", {
      params: { path: { record_id: recordId } },
      body: { account_id: accountId, account_skipped: skipped },
    });
    if (error) return { success: false, error: extractErrorMessage(error, "更改账户失败") };
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/accounts/flows");
    revalidatePath("/admin/ledger");
    return { success: true, data: null };
  } catch (e) {
    logger.error("补挂/换挂账户异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}
