import { randomUUID } from "node:crypto";
import { expect, request as playwrightRequest, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 线索列表「对接人」展示兜底 E2E.
 *
 * 场景：员工自己提交线索且未指定门店/经纪人时，后端归属为空；
 * 列表/详情应展示创建人本人，而不是空白「—」。C 端客户自建线索不参与兜底。
 *
 * 造数：后台 API 建员工线索；C 端注册账号 + 公共 API 建客户线索。
 * 清理：afterAll 删除线索与 C 端账号。
 * 工件：e2e-artifacts/lead-list-owner-fallback/*.json + *.png
 */

const ARTIFACT_DIR = join(process.cwd(), "e2e-artifacts", "lead-list-owner-fallback");
const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";

test.describe.configure({ mode: "serial" });

let api: Awaited<ReturnType<typeof createApiContext>>;
let adminName = "";
const createdLeadIds: string[] = [];
const createdUserIds: string[] = [];

interface CustomerAccount {
  id: string;
  accessToken: string;
  nickname: string;
}

let customer: CustomerAccount;

function saveArtifact(name: string, payload: unknown): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, name), JSON.stringify(payload, null, 2), "utf-8");
}

async function createStaffLead(suffix: string): Promise<{ id: string; community: string }> {
  const community = `E2E对接人-员工-${suffix}-${Date.now()}`;
  const res = await api.ctx.post("/api/v1/leads", {
    data: {
      community_name: community,
      floor_info: "12/18层",
      layout: "2室1厅",
      area: 88.5,
      total_price: 520,
    },
  });
  expect(res.ok(), `造员工线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  createdLeadIds.push(body.id);
  return { id: body.id, community };
}

async function createCustomerLead(suffix: string): Promise<{ id: string; community: string }> {
  const community = `E2E对接人-客户-${suffix}-${Date.now()}`;
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  try {
    const res = await ctx.post("/api/v1/public/leads", {
      data: {
        community_name: community,
        floor_info: "5/10层",
        area: 80,
      },
      headers: { Authorization: `Bearer ${customer.accessToken}` },
    });
    expect(res.ok(), `造客户线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
    const body = (await res.json()) as { id: string };
    createdLeadIds.push(body.id);
    return { id: body.id, community };
  } finally {
    await ctx.dispose();
  }
}

/** 打开列表页并定位目标线索所在行 */
async function gotoLeadRow(page: Page, community: string) {
  await page.goto(`/admin/leads?search=${encodeURIComponent(community)}`, {
    waitUntil: "domcontentloaded",
  });
  const row = page.locator('[data-testid="lead-row"]').filter({ hasText: community }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  return row;
}

test.beforeAll(async () => {
  api = await createApiContext();

  const meRes = await api.ctx.get("/api/v1/users/me");
  expect(meRes.ok(), `读取当前登录用户失败：${meRes.status()} ${await meRes.text()}`).toBeTruthy();
  const me = (await meRes.json()) as { username: string; nickname?: string | null };
  adminName = me.nickname || me.username;

  const suffix = `${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 6)}`;
  const ctx = await playwrightRequest.newContext({ baseURL: API_BASE });
  try {
    const res = await ctx.post("/api/v1/public/auth/register", {
      data: {
        username: `e2e_owner_${suffix}`,
        password: `E2e!${randomUUID()}`,
        nickname: `E2E客户${suffix}`,
      },
    });
    expect(res.ok(), `C 端注册失败：${res.status()} ${await res.text()}`).toBeTruthy();
    const body = (await res.json()) as {
      access_token: string;
      user: { id: string; nickname?: string | null };
    };
    customer = {
      id: body.user.id,
      accessToken: body.access_token,
      nickname: body.user.nickname || `E2E客户${suffix}`,
    };
    createdUserIds.push(customer.id);
  } finally {
    await ctx.dispose();
  }
});

test.afterAll(async () => {
  for (const id of createdLeadIds) {
    await api?.ctx.delete(`/api/v1/leads/${id}`).catch(() => undefined);
  }
  for (const id of createdUserIds) {
    await api?.ctx.delete(`/api/v1/users/${id}`).catch(() => undefined);
  }
  await api?.dispose();
});

test("员工自建且无归属的线索，对接人显示为本人", async ({ page }) => {
  const lead = await createStaffLead("staff");
  await loginPage(page);
  const row = await gotoLeadRow(page, lead.community);

  await expect(row.getByTestId("lead-owner-name")).toHaveText(adminName);
  await expect(row.getByTestId("lead-row-owner")).toContainText("—");

  const listRes = await api.ctx.get(`/api/v1/leads?search=${encodeURIComponent(lead.community)}`);
  expect(listRes.ok()).toBeTruthy();
  const list = (await listRes.json()) as {
    items: Array<{
      id: string;
      owner_employee_id: string | null;
      owner_employee_name: string | null;
    }>;
  };
  const item = list.items.find((candidate) => candidate.id === lead.id);
  expect(item?.owner_employee_id).toBeNull();
  expect(item?.owner_employee_name).toBe(adminName);

  saveArtifact("staff-lead.json", {
    leadId: lead.id,
    community: lead.community,
    adminName,
    ownerEmployeeId: item?.owner_employee_id,
    ownerEmployeeName: item?.owner_employee_name,
  });
  await page.screenshot({ path: join(ARTIFACT_DIR, "staff-lead.png"), fullPage: false });
});

test("C 端客户自建且无归属的线索，对接人不误显示客户昵称", async ({ page }) => {
  const lead = await createCustomerLead("customer");
  await loginPage(page);
  const row = await gotoLeadRow(page, lead.community);

  await expect(row.getByTestId("lead-owner-name")).toHaveText("—");
  await expect(row.getByTestId("lead-row-owner")).not.toContainText(customer.nickname);

  const listRes = await api.ctx.get(`/api/v1/leads?search=${encodeURIComponent(lead.community)}`);
  expect(listRes.ok()).toBeTruthy();
  const list = (await listRes.json()) as {
    items: Array<{
      id: string;
      owner_employee_id: string | null;
      owner_employee_name: string | null;
    }>;
  };
  const item = list.items.find((candidate) => candidate.id === lead.id);
  expect(item?.owner_employee_id).toBeNull();
  expect(item?.owner_employee_name).not.toBe(customer.nickname);

  saveArtifact("customer-lead.json", {
    leadId: lead.id,
    community: lead.community,
    customerNickname: customer.nickname,
    ownerEmployeeId: item?.owner_employee_id,
    ownerEmployeeName: item?.owner_employee_name,
  });
  await page.screenshot({ path: join(ARTIFACT_DIR, "customer-lead.png"), fullPage: false });
});
