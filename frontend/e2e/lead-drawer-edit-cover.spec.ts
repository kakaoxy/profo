// 线索详情抽屉：编辑小区（清除旧楼栋/户室）与设置标题图 E2E
//
// 前置：后端 :8000 + 前端 :3000；账号密码从 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 读取。
// 造数走 backend/.venv/bin/python，按 E2E_MARK 精确隔离。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-LEAD-EDIT-${Date.now()}`;
const BACKEND_DIR = path.resolve(__dirname, "../../backend");
const ARTIFACT_DIR = path.resolve(__dirname, "../e2e-artifacts/lead-drawer-edit-cover");

function backendPython(script: string): string {
  return execFileSync(path.resolve(BACKEND_DIR, ".venv/bin/python"), ["-c", script], {
    cwd: BACKEND_DIR,
    stdio: "pipe",
    encoding: "utf-8",
    env: { ...process.env, E2E_MARK: MARK },
  });
}

const SEED_SCRIPT = `
import json, os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import BdBuilding, BdRoom, Community, Lead

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    def make_community(label: str) -> Community:
        c = Community(
            name=f"{mark}{label}",
            district="上海市",
            business_circle="E2E测试板块",
            is_active=True,
        )
        db.add(c)
        db.flush()
        return c

    community_a = make_community("小区A")
    community_b = make_community("小区B")

    building = BdBuilding(community_id=community_a.id, building_no="1", room_count=1)
    db.add(building)
    db.flush()
    room = BdRoom(building_id=building.id, room_no="0101", floor=1)
    db.add(room)
    db.flush()

    edit_lead = Lead(
        community_name=community_a.name,
        community_id=community_a.id,
        building_id=building.id,
        room_id=room.id,
        dict_status="linked",
        layout="2室1厅",
        orientation="南",
        floor_info="1/6",
        area=88,
        total_price=500,
        unit_price=56818,
        district="上海市",
        business_area="E2E测试板块",
    )
    cover_lead = Lead(
        community_name=f"{mark}图片小区",
        layout="2室1厅",
        orientation="南",
        floor_info="2/6",
        area=90,
        total_price=520,
        unit_price=57778,
        district="上海市",
        business_area="E2E测试板块",
        images=["/about/dashboard.png", "/about/hero-bg.png"],
    )
    # 存量线索：只有小区名称，没有 community_id / dict_status
    legacy_lead = Lead(
        community_name=f"{mark}旧小区",
        layout="1室1厅",
        orientation="南",
        floor_info="1/6",
        area=50,
        total_price=300,
        unit_price=60000,
        district="上海市",
        business_area="E2E测试板块",
    )
    db.add_all([edit_lead, cover_lead, legacy_lead])
    db.commit()
    print(json.dumps({
        "edit_lead_id": edit_lead.id,
        "cover_lead_id": cover_lead.id,
        "legacy_lead_id": legacy_lead.id,
        "community_a_id": community_a.id,
        "community_a_name": community_a.name,
        "community_b_id": community_b.id,
        "community_b_name": community_b.name,
        "cover_community_name": cover_lead.community_name,
        "legacy_community_name": legacy_lead.community_name,
    }))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import BdBuilding, BdRoom, Community, Lead

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    lead_ids = [x.id for x in db.query(Lead.id).filter(Lead.community_name.like(f"%{mark}%")).all()]
    if lead_ids:
        db.query(Lead).filter(Lead.id.in_(lead_ids)).delete(synchronize_session=False)
    community_ids = [x.id for x in db.query(Community.id).filter(Community.name.like(f"%{mark}%")).all()]
    building_ids = []
    if community_ids:
        building_ids = [
            x.id for x in db.query(BdBuilding.id).filter(BdBuilding.community_id.in_(community_ids)).all()
        ]
    if building_ids:
        db.query(BdRoom).filter(BdRoom.building_id.in_(building_ids)).delete(synchronize_session=False)
        db.query(BdBuilding).filter(BdBuilding.id.in_(building_ids)).delete(synchronize_session=False)
    if community_ids:
        db.query(Community).filter(Community.id.in_(community_ids)).delete(synchronize_session=False)
    db.commit()
    print("cleaned")
finally:
    db.close()
`;

interface Seeded {
  edit_lead_id: string;
  cover_lead_id: string;
  legacy_lead_id: string;
  community_a_id: string;
  community_a_name: string;
  community_b_id: string;
  community_b_name: string;
  cover_community_name: string;
  legacy_community_name: string;
}

let seeded: Seeded;

test.beforeAll(() => {
  test.setTimeout(120_000);
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  backendPython(CLEANUP_SCRIPT);
  seeded = JSON.parse(backendPython(SEED_SCRIPT)) as Seeded;
});

test.afterAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await loginPage(page);
});

test("抽屉编辑切换小区后清空旧楼栋/户室并持久化", async ({ page }) => {
  const { ctx, dispose } = await createApiContext();
  try {
    await page.goto(`/admin/leads?search=${encodeURIComponent(seeded.community_a_name)}`);
    const row = page.locator("tr").filter({ hasText: seeded.community_a_name }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText(seeded.community_a_name).first()).toBeVisible({
      timeout: 15_000,
    });
    await drawer.getByRole("button", { name: "编辑线索" }).click();

    await expect(page.getByRole("heading", { name: "编辑线索" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByPlaceholder("选楼栋/户室后自动拼装")).toHaveValue(
      `${seeded.community_a_name} 1号 101`,
    );
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "drawer-edit-form.png") });

    const picker = page.getByTestId("field-community-name");
    await picker.getByRole("combobox").first().click();
    const searchInput = page.getByPlaceholder("输入小区名/地址/别名搜索");
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.fill(seeded.community_b_name);

    const option = page
      .locator("[data-radix-popper-content-wrapper] button")
      .filter({ hasText: seeded.community_b_name })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await expect(option).toContainText("上海市", { timeout: 15_000 });
    await option.click();
    await expect(picker.getByText(seeded.community_b_name).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.screenshot({ path: path.join(ARTIFACT_DIR, "after-select-b.png") });

    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("heading", { name: "编辑线索" })).toHaveCount(0, {
      timeout: 15_000,
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "after-save.png") });

    await expect
      .poll(
        async () => {
          const response = await ctx.get(`/api/v1/leads/${seeded.edit_lead_id}`);
          expect(response.ok()).toBeTruthy();
          const body = (await response.json()) as {
            community_id: string | null;
            building_id: number | null;
            room_id: number | null;
            dict_status: string | null;
          };
          return {
            community_id: body.community_id,
            building_id: body.building_id,
            room_id: body.room_id,
            dict_status: body.dict_status,
          };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        community_id: seeded.community_b_id,
        building_id: null,
        room_id: null,
        dict_status: "manual",
      });

    // API 回归：只传 community_id 时也必须清空原小区的楼栋/户室并重算 dict_status
    const updateResponse = await ctx.put(`/api/v1/leads/${seeded.edit_lead_id}`, {
      data: { community_id: seeded.community_a_id },
    });
    expect(updateResponse.ok()).toBeTruthy();
    const updated = (await updateResponse.json()) as {
      community_id: string | null;
      building_id: number | null;
      room_id: number | null;
      dict_status: string | null;
    };
    expect(updated.community_id).toBe(seeded.community_a_id);
    expect(updated.building_id).toBeNull();
    expect(updated.room_id).toBeNull();
    expect(updated.dict_status).toBe("manual");
  } finally {
    await dispose();
  }
});

test("影像库可将第二张图片设为标题图并持久化", async ({ page }) => {
  const { ctx, dispose } = await createApiContext();
  try {
    await page.goto(`/admin/leads?search=${encodeURIComponent(seeded.cover_community_name)}`);
    const row = page.locator("tr").filter({ hasText: seeded.cover_community_name }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.locator("img").first()).toHaveAttribute("src", /dashboard\.png/);
    await row.click();

    const drawer = page.getByRole("dialog");
    await expect(drawer.getByRole("img", { name: "图片 1" })).toHaveAttribute(
      "src",
      /dashboard\.png/,
      {
        timeout: 15_000,
      },
    );
    await drawer.getByRole("button", { name: "将第 2 张图片设为标题图" }).click();

    await expect(drawer.getByRole("img", { name: "图片 1" })).toHaveAttribute(
      "src",
      /hero-bg\.png/,
      {
        timeout: 15_000,
      },
    );
    await expect(drawer.getByText("标题图")).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_DIR, "cover-set.png") });

    await expect
      .poll(
        async () => {
          const response = await ctx.get(`/api/v1/leads/${seeded.cover_lead_id}`);
          expect(response.ok()).toBeTruthy();
          const body = (await response.json()) as { images: string[] };
          return body.images;
        },
        { timeout: 15_000 },
      )
      .toEqual(["/about/hero-bg.png", "/about/dashboard.png"]);

    await page.keyboard.press("Escape");
    await expect(row.locator("img").first()).toHaveAttribute("src", /hero-bg\.png/, {
      timeout: 15_000,
    });
  } finally {
    await dispose();
  }
});

test("编辑旧线索时回显原小区名称，不要求重新填写", async ({ page }) => {
  const { ctx, dispose } = await createApiContext();
  try {
    await page.goto(`/admin/leads?search=${encodeURIComponent(seeded.legacy_community_name)}`);
    const row = page.locator("tr").filter({ hasText: seeded.legacy_community_name }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    const drawer = page.getByRole("dialog");
    await drawer.getByRole("button", { name: "编辑线索" }).click();
    await expect(page.getByRole("heading", { name: "编辑线索" })).toBeVisible({ timeout: 15_000 });

    const picker = page.getByTestId("field-community-name");
    await expect(picker.getByRole("combobox").first()).toContainText(seeded.legacy_community_name);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "legacy-community-prefilled.png"),
    });

    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("heading", { name: "编辑线索" })).toHaveCount(0, {
      timeout: 15_000,
    });

    await expect
      .poll(
        async () => {
          const response = await ctx.get(`/api/v1/leads/${seeded.legacy_lead_id}`);
          expect(response.ok()).toBeTruthy();
          const body = (await response.json()) as {
            community_id: string | null;
            community_name: string;
          };
          return {
            community_id: body.community_id,
            community_name: body.community_name,
          };
        },
        { timeout: 15_000 },
      )
      .toEqual({
        community_id: null,
        community_name: seeded.legacy_community_name,
      });
  } finally {
    await dispose();
  }
});
