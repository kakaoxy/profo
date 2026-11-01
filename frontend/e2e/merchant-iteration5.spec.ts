import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createApiContext } from "./helpers/auth";

/**
 * 商户管理模块 迭代 5（docs/商户管理模块需求/商户管理模块-需求与迭代记录.md §11，来源 m02501）验证用例。
 *
 * 覆盖：
 * - REQ-IT5-01 合作状态与协议完全解耦：运营改「已合作」不再要求已签协议；status-options 含全部字典状态
 * - REQ-IT5-02 协议列表 onShow 刷新（源码断言，小程序页面无法在 Playwright 内运行）
 * - REQ-IT5-03 取消审核：发起即待签署并生成分享码；审核端点已下线；商户用分享码自助签署；
 *   后台/小程序不再出现审核入口
 *
 * C 端（/public/**）需要 C 端令牌（aud=c），后台 admin 令牌调用会 401，故商户签署用例自取令牌。
 * 串行执行：afterAll 按 MARK 清理本文件造的数据，并行会互相删除。
 */

test.describe.configure({ mode: "serial", timeout: 120_000 });

const BACKEND = path.resolve(__dirname, "../../backend");
const MINIAPP = path.resolve(__dirname, "../../miniapp");
const ADMIN_APP = path.resolve(__dirname, "../src/app/(main)/admin/merchant/agreements");
const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const MARK = `E2EIT5${Date.now()}`;
const PHONE = `138${MARK.slice(-8)}`;
const SIGNER_PHONE = `137${MARK.slice(-8)}`;

let companyId = "";
let storeId = "";
let templateId = "";
let agreementId = "";
let signCode = "";
let cToken = "";

/** 1x1 透明 PNG（最小合法图片，用作签名图与扫描件）. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function cApi() {
  if (!cToken) {
    const ctx = await playwrightRequest.newContext();
    try {
      const res = await ctx.post(`${API_BASE}/api/v1/public/auth/token`, {
        form: {
          username: process.env.E2E_ADMIN_USER ?? "",
          password: process.env.E2E_ADMIN_PASSWORD ?? "",
        },
      });
      expect(res.ok(), `C 端令牌获取失败 HTTP ${res.status()}`).toBeTruthy();
      cToken = ((await res.json()) as { access_token: string }).access_token;
    } finally {
      await ctx.dispose();
    }
  }
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${cToken}` },
  });
}

test.beforeAll(async () => {
  const { ctx, dispose } = await createApiContext();
  try {
    const company = await ctx.post("/api/v1/admin/merchant/companies", {
      data: { company_name: `${MARK}协议公司` },
    });
    expect(company.ok(), `建公司失败 HTTP ${company.status()}`).toBeTruthy();
    companyId = ((await company.json()) as { id: string }).id;

    const store = await ctx.post("/api/v1/admin/merchant/stores", {
      data: {
        company_id: companyId,
        store_name: `${MARK}协议门店`,
        district: "浦东新区",
        business_circle: "陆家嘴商圈",
        address: `${MARK}协议路 1 号`,
        lng: 121.5 + (Number(MARK.slice(-4)) % 500) / 1000,
        lat: 31.2 + (Number(MARK.slice(-4)) % 400) / 1000,
        contact_name: "迭代五",
        contact_phone: PHONE,
        cooperation_status: "not_cooperated",
        force_create_reason: "E2E 迭代 5 用例：坐标唯一但命中历史残留门店",
      },
    });
    const storeBody = await store.text();
    expect(store.ok(), `建门店失败 HTTP ${store.status()} body=${storeBody.slice(0, 300)}`).toBeTruthy();
    storeId = (JSON.parse(storeBody) as { store: { id: string } }).store.id;

    const template = await ctx.post("/api/v1/admin/merchant/agreement-templates", {
      data: {
        template_name: `${MARK}格式条款`,
        cooperation_type: "merchant",
        content: `${MARK} 品牌合作协议：本协议为格式条款，商户核对信息后签署即生效。`,
      },
    });
    const templateBody = await template.text();
    expect(template.ok(), `建模板失败 HTTP ${template.status()} body=${templateBody.slice(0, 300)}`).toBeTruthy();
    templateId = (JSON.parse(templateBody) as { id: string }).id;
  } finally {
    await dispose();
  }
});

test.afterAll(() => {
  execFileSync(
    path.resolve(BACKEND, ".venv/bin/python"),
    [
      "-c",
      `
import os, sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import (
    MerchantAgreement,
    MerchantAgreementTemplate,
    MerchantCompany,
    MerchantStore,
)
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(MerchantAgreement).filter(MerchantAgreement.remark.like(f"%{mark}%")).delete(
        synchronize_session=False
    )
    db.query(MerchantAgreementTemplate).filter(
        MerchantAgreementTemplate.template_name.like(f"%{mark}%")
    ).delete(synchronize_session=False)
    db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).delete(
        synchronize_session=False
    )
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False
    )
    db.commit()
finally:
    db.close()
`,
    ],
    { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK } },
  );
});

test("REQ-IT5-01 合作状态与协议解耦：无已签协议也能改为已合作，可选状态来自字典", async () => {
  const { ctx, dispose } = await createApiContext();
  try {
    // 解耦前：改为已合作会因「必须先签署电子合作协议」返回 400
    const change = await ctx.post(`/api/v1/admin/merchant/stores/${storeId}/status`, {
      data: { target_status: "cooperated", reason: `${MARK} 解耦验证` },
    });
    const body = await change.text();
    expect(change.ok(), `改合作状态失败 HTTP ${change.status()} body=${body.slice(0, 300)}`).toBeTruthy();
    expect((JSON.parse(body) as { cooperation_status: string }).cooperation_status).toBe("cooperated");
  } finally {
    await dispose();
  }

  // 可选项来自字典全部状态（排除当前状态）：「已合作」不再被协议屏蔽
  const cCtx = await cApi();
  try {
    const options = await cCtx.get(`/api/v1/public/merchant/stores/${storeId}/status-options`);
    expect(options.ok(), `status-options 失败 HTTP ${options.status()}`).toBeTruthy();
    const optionBody = (await options.json()) as {
      current_status: string;
      items: Array<{ code: string }>;
    };
    const codes = optionBody.items.map((item) => item.code);
    expect(optionBody.current_status).toBe("cooperated");
    expect(codes).toContain("not_cooperated");
    expect(codes).not.toContain(optionBody.current_status);
  } finally {
    await cCtx.dispose();
  }
});

test("REQ-IT5-03 发起即待签署并生成分享码，审核端点已下线", async () => {
  const { ctx, dispose } = await createApiContext();
  try {
    const created = await ctx.post("/api/v1/admin/merchant/agreements", {
      data: {
        subject_type: "store",
        store_id: storeId,
        template_id: templateId,
        signer_name: "迭代五商户",
        signer_phone: SIGNER_PHONE,
        remark: `${MARK} 发起协议`,
      },
    });
    const createdBody = await created.text();
    expect(
      created.ok(),
      `发起协议失败 HTTP ${created.status()} body=${createdBody.slice(0, 300)}`,
    ).toBeTruthy();
    const agreement = JSON.parse(createdBody) as { id: string; status: string; sign_code: string };
    agreementId = agreement.id;
    signCode = agreement.sign_code;
    // 取消审核：发起即待签署，不再是「未发起 + 待审核」
    expect(agreement.status).toBe("pending_sign");
    expect(signCode, "发起后应生成商户签署分享码").toBeTruthy();

    // 审核端点已删除
    const review = await ctx.post(`/api/v1/admin/merchant/agreements/${agreementId}/review`, {
      data: { approved: true },
    });
    expect(review.status(), "审核端点应已下线").toBe(404);
  } finally {
    await dispose();
  }
});

test("REQ-IT5-03 商户凭分享码核对并签署，签署后门店自动为已合作", async () => {
  const ctx = await cApi();
  try {
    // 错误分享码：拒绝
    const forbidden = await ctx.get(
      `/api/v1/public/merchant/agreement-sign/${agreementId}?code=00000000-0000-0000-0000-000000000000`,
    );
    expect(forbidden.status(), "错误分享码应被拒绝").toBe(403);

    // 正确分享码：可签署视图含正文与主体信息
    const view = await ctx.get(
      `/api/v1/public/merchant/agreement-sign/${agreementId}?code=${signCode}`,
    );
    const viewBody = await view.text();
    expect(view.ok(), `签署视图失败 HTTP ${view.status()} body=${viewBody.slice(0, 300)}`).toBeTruthy();
    const signView = JSON.parse(viewBody) as {
      can_sign: boolean;
      status_label: string;
      content: string;
      subject_name: string;
    };
    expect(signView.can_sign).toBe(true);
    expect(signView.status_label).toBe("待签署");
    expect(signView.content).toContain(MARK);
    expect(signView.subject_name).toContain(MARK);

    // 上传签名图（REQ-IT4-03 起的本地存储链路）
    const upload = await ctx.post("/api/v1/public/files/upload", {
      multipart: { file: { name: "sign.png", mimeType: "image/png", buffer: PNG_BYTES } },
    });
    const uploadBody = await upload.text();
    expect(upload.ok(), `签名上传失败 HTTP ${upload.status()} body=${uploadBody.slice(0, 200)}`).toBeTruthy();
    const signatureUrl = (JSON.parse(uploadBody) as { url: string }).url;
    expect(signatureUrl).toContain("/static/uploads/");

    const signed = await ctx.post(
      `/api/v1/public/merchant/agreement-sign/${agreementId}?code=${signCode}`,
      {
        data: {
          signer_name: "迭代五商户",
          signer_phone: SIGNER_PHONE,
          signature_url: signatureUrl,
          confirmed: true,
        },
      },
    );
    const signedBody = await signed.text();
    expect(signed.ok(), `商户签署失败 HTTP ${signed.status()} body=${signedBody.slice(0, 300)}`).toBeTruthy();
    expect((JSON.parse(signedBody) as { status: string }).status).toBe("signed");

    // Q2=B：签署后自动联动门店合作状态
    const store = await ctx.get(`/api/v1/public/merchant/stores/${storeId}`);
    expect(store.ok()).toBeTruthy();
    expect((await store.json()) as { cooperation_status: string }).toMatchObject({
      cooperation_status: "cooperated",
    });
  } finally {
    await ctx.dispose();
  }
});

test("REQ-IT5-02/03 小程序源码断言：列表 onShow 刷新、详情页分享入口、无审核残留", () => {
  const read = (relativePath: string): string => fs.readFileSync(path.resolve(MINIAPP, relativePath), "utf8");

  // REQ-IT5-02：「全部」看不到新发起的待签署 → 列表页需在 onShow 重新拉取
  const listTs = read("pages/merchant/agreement/list/index.ts");
  expect(listTs).toMatch(/onShow\(\)/);
  // onShow 内必须重新拉取（首帧用 shownOnce 跳过，避免与 onLoad 双请求）
  expect(listTs).toMatch(/onShow\(\)[\s\S]{0,400}?this\.load\(/);
  expect(listTs).toMatch(/shownOnce/);
  expect(listTs).not.toMatch(/reviewText/);

  // REQ-IT5-03：详情页提供「分享给商户签署」（open-type=share + onShareAppMessage 带分享码）
  const detailTs = read("pages/merchant/agreement/detail/index.ts");
  expect(detailTs).toMatch(/onShareAppMessage/);
  expect(detailTs).toMatch(/agreement\/merchant-sign\/index\?id=/);
  expect(detailTs).toMatch(/sign_code/);
  const detailWxml = read("pages/merchant/agreement/detail/index.wxml");
  expect(detailWxml).toContain('open-type="share"');
  expect(detailWxml).not.toContain("审核状态");
  expect(detailWxml).not.toContain("审核意见");

  // 商户签署页存在且校验分享码、确认勾选、手机号
  const merchantSignTs = read("pages/merchant/agreement/merchant-sign/index.ts");
  expect(merchantSignTs).toMatch(/public\/merchant\/agreement-sign/);
  expect(merchantSignTs).toMatch(/confirmed/);
  expect(merchantSignTs).toMatch(/\^1\\d\{10\}\$/);
  const merchantSignWxml = read("pages/merchant/agreement/merchant-sign/index.wxml");
  expect(merchantSignWxml).toContain("我已核对协议正文与商户信息");
  expect(merchantSignWxml).toContain("merchant-signature");

  // 页面已注册，分享链接可直接打开
  const appJson = JSON.parse(read("app.json")) as {
    subPackages?: Array<{ root: string; pages: string[] }>;
    subpackages?: Array<{ root: string; pages: string[] }>;
  };
  const merchantPkg = (appJson.subPackages ?? appJson.subpackages ?? []).find(
    (pkg) => pkg.root === "pages/merchant",
  );
  expect(merchantPkg?.pages).toContain("agreement/merchant-sign/index");

  // 员工侧签署页与发起页不再提示「等待运营审核」
  expect(read("pages/merchant/agreement/sign/index.ts")).not.toMatch(/等待运营审核/);
  expect(read("pages/merchant/agreement/create/index.ts")).not.toMatch(/已提交审核/);
});

test("REQ-IT5-03 后台协议页不再出现审核入口", () => {
  const listPage = fs.readFileSync(path.resolve(ADMIN_APP, "page.tsx"), "utf8");
  expect(listPage).not.toContain("REVIEW_LABELS");
  expect(listPage).not.toMatch(/\/review`/);
  expect(listPage).not.toMatch(/审核状态/);

  const detailPage = fs.readFileSync(path.resolve(ADMIN_APP, "[id]/page.tsx"), "utf8");
  expect(detailPage).not.toContain("REVIEW_LABELS");
  expect(detailPage).not.toMatch(/\/review`/);
  expect(detailPage).toContain("void_reason");
});
