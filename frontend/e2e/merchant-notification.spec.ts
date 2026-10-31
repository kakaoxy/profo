// 商户管理 V09 · 通知 UI 跳转 E2E
//
// 覆盖：
//  1. 消息中心出现「商户」分类且能看到协议到期/拜访超期通知（REQ-M14-005）
//  2. 点击协议到期通知 → 跳转协议详情（AC-V09-010）
//  3. 拜访超期通知的跳转目标门店详情可达
//
// 造数直接调用统一通知中心 emit（消费逻辑已由 backend/tests/test_merchant_notification.py
// 覆盖），避免跑全量 scan 误伤开发库其它门店。afterAll 按 E2E_MARK 精确清理。

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-MERCHANT-NOTIF-${Date.now()}`;
const BACKEND_DIR = path.resolve(__dirname, "../../backend");

function backendPython(script: string): string {
  return execFileSync(path.resolve(BACKEND_DIR, ".venv/bin/python"), ["-c", script], {
    cwd: BACKEND_DIR,
    stdio: "pipe",
    encoding: "utf-8",
    env: {
      ...process.env,
      E2E_MARK: MARK,
      UPLOAD_DIR: path.resolve(BACKEND_DIR, "static/uploads"),
    },
  });
}

const SEED_SCRIPT = `
import json, os, sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantAgreement, MerchantCompany, MerchantStore, User
from services.notification import Audience, EventType
from services.notification.service import NotificationEvent, NotificationService

mark = os.environ["E2E_MARK"]
username = os.environ.get("E2E_ADMIN_USER", "admin")
db = SessionLocal()
try:
    admin = db.query(User).filter(User.username == username).first()
    if admin is None:
        raise SystemExit("找不到 E2E 管理员账号")
    now = datetime.now(timezone.utc)
    company = MerchantCompany(company_name=f"{mark}公司", contact_name="联系人", contact_phone="13800009999")
    db.add(company)
    db.flush()
    store = MerchantStore(
        company_id=company.id,
        company_name=company.company_name,
        store_name=f"{mark}门店",
        province="上海市",
        city="上海市",
        district="浦东新区",
        business_circle="陆家嘴商圈",
        address="世纪大道 100 号",
        contact_name="王店长",
        contact_phone="13800009999",
        source="backoffice",
        owner_employee_id=admin.id,
        last_visit_at=now - timedelta(days=40),
        status="normal",
        review_status="approved",
    )
    db.add(store)
    db.flush()
    agreement = MerchantAgreement(
        store_id=store.id,
        company_id=company.id,
        subject_type="store",
        agreement_no=f"{mark}-AGR",
        status="signed",
        review_status="approved",
        signer_name="王店长",
        signer_phone="13800009999",
        signed_at=now - timedelta(days=355),
        expire_at=now + timedelta(days=10),
    )
    db.add(agreement)
    db.commit()

    svc = NotificationService(db)
    svc.emit(NotificationEvent(
        type=EventType.MERCHANT_AGREEMENT_EXPIRING,
        audience=Audience(user_ids=(admin.id,)),
        fields={
            "agreement_id": agreement.id,
            "subject_name": store.store_name,
            "expire_date": agreement.expire_at.date().isoformat(),
        },
        dedupe_fields={
            "agreement_id": agreement.id,
            "expire_date": agreement.expire_at.date().isoformat(),
        },
        source_module="merchant",
        source_id=agreement.id,
        wechat=False,
    ))
    svc.emit(NotificationEvent(
        type=EventType.MERCHANT_VISIT_OVERDUE,
        audience=Audience(user_ids=(admin.id,)),
        fields={
            "store_id": store.id,
            "store_name": store.store_name,
            "last_visit_date": store.last_visit_at.date().isoformat(),
        },
        dedupe_fields={
            "store_id": store.id,
            "last_visit_date": store.last_visit_at.date().isoformat(),
        },
        source_module="merchant",
        source_id=store.id,
        wechat=False,
    ))
    print(json.dumps({"agreement_id": agreement.id, "store_id": store.id}))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import (
    MerchantAgreement, MerchantCompany, MerchantStore, MerchantVisit,
    Notification, NotificationDeliveryLog, NotificationRecipient,
)

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    note_ids = [n.id for n in db.query(Notification).filter(Notification.title.like(f"%{mark}%")).all()]
    if note_ids:
        db.query(NotificationRecipient).filter(
            NotificationRecipient.notification_id.in_(note_ids)).delete(synchronize_session=False)
        db.query(NotificationDeliveryLog).filter(
            NotificationDeliveryLog.notification_id.in_(note_ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.id.in_(note_ids)).delete(synchronize_session=False)
    store_ids = [s.id for s in db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).all()]
    agreement_ids = [
        a.id for a in db.query(MerchantAgreement)
        .filter(MerchantAgreement.agreement_no.like(f"%{mark}%")).all()
    ]
    if store_ids:
        db.query(MerchantVisit).filter(MerchantVisit.store_id.in_(store_ids)).delete(synchronize_session=False)
    if agreement_ids:
        db.query(MerchantAgreement).filter(MerchantAgreement.id.in_(agreement_ids)).delete(
            synchronize_session=False)
    if store_ids:
        db.query(MerchantStore).filter(MerchantStore.id.in_(store_ids)).delete(synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.commit()
    print(f"cleaned notes={len(note_ids)} stores={len(store_ids)} agreements={len(agreement_ids)}")
finally:
    db.close()
`;

let agreementId = "";
let storeId = "";

test.beforeAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
  const seeded = JSON.parse(backendPython(SEED_SCRIPT)) as {
    agreement_id: string;
    store_id: string;
  };
  agreementId = seeded.agreement_id;
  storeId = seeded.store_id;
});

test.afterAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await loginPage(page);
});

test("消息中心出现商户分类与两条商户通知", async ({ page }) => {
  await page.goto("/admin/notifications");
  await expect(page.getByRole("button", { name: /^商户\d+$/ })).toBeVisible();
  await expect(page.getByText(`合作协议即将到期：${MARK}门店`).first()).toBeVisible();
  await expect(page.getByText(`门店超期未拜访：${MARK}门店`).first()).toBeVisible();
});

test("点击协议到期通知跳转协议详情", async ({ page }) => {
  await page.goto("/admin/notifications");
  const api = await page.request.get("/api/v1/notifications?category=merchant");
  const body = (await api.json()) as {
    items: { type: string; action_type: string; action_url: string | null }[];
  };
  const note = body.items.find((i) => i.type === "merchant.agreement.expiring");
  expect(note?.action_type).toBe("route");
  expect(note?.action_url).toBe(`/admin/merchant/agreements/${agreementId}`);
  const item = page.getByRole("button", { name: /合作协议即将到期/ }).first();
  await expect(item).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(new RegExp(`/admin/merchant/agreements/${agreementId}`));
  await expect(page.getByRole("heading", { name: `${MARK}-AGR` })).toBeVisible();
  await expect(page.getByText(`${MARK}门店`).first()).toBeVisible();
  await expect(page.getByText("返回协议列表")).toBeVisible();
});

test("拜访超期通知的门店详情可达", async ({ page }) => {
  await page.goto(`/admin/merchant/stores/${storeId}`);
  await expect(page.getByRole("heading", { name: "门店详情" })).toBeVisible();
  await expect(page.getByText(`${MARK}门店`).first()).toBeVisible();
});
