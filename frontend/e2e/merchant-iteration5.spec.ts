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
 * - REQ-IT5-04 发起页签署人从门店经纪人中选择（手机号因脱敏仍手填）
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
const BROKER_PHONE = `136${MARK.slice(-8)}`;
const BROKER_PHONE2 = `135${MARK.slice(-8)}`;

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
    expect(
      store.ok(),
      `建门店失败 HTTP ${store.status()} body=${storeBody.slice(0, 300)}`,
    ).toBeTruthy();
    storeId = (JSON.parse(storeBody) as { store: { id: string } }).store.id;

    const template = await ctx.post("/api/v1/admin/merchant/agreement-templates", {
      data: {
        template_name: `${MARK}格式条款`,
        cooperation_type: "merchant",
        content: `${MARK} 品牌合作协议：本协议为格式条款，商户核对信息后签署即生效。`,
      },
    });
    const templateBody = await template.text();
    expect(
      template.ok(),
      `建模板失败 HTTP ${template.status()} body=${templateBody.slice(0, 300)}`,
    ).toBeTruthy();
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
from sqlalchemy import or_
from db import SessionLocal
from models import (
    MerchantAgreement,
    MerchantAgreementTemplate,
    MerchantBroker,
    MerchantBrokerBinding,
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
    store_ids = [
        row.id
        for row in db.query(MerchantStore.id).filter(MerchantStore.store_name.like(f"%{mark}%")).all()
    ]
    # REQ-IT5-06 建店会自动生成占位经纪人（姓名不含 mark），按门店归属一并清理，避免残留孤儿档案
    store_filter = MerchantBroker.store_id.in_(store_ids) if store_ids else False
    broker_ids = [
        row.id
        for row in db.query(MerchantBroker.id)
        .filter(or_(MerchantBroker.name.like(f"%{mark}%"), store_filter))
        .all()
    ]
    if broker_ids or store_ids:
        db.query(MerchantBrokerBinding).filter(
            (MerchantBrokerBinding.broker_id.in_(broker_ids))
            | (MerchantBrokerBinding.store_id.in_(store_ids))
        ).delete(synchronize_session=False)
    if broker_ids:
        db.query(MerchantBroker).filter(MerchantBroker.id.in_(broker_ids)).delete(
            synchronize_session=False
        )
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
    expect(
      change.ok(),
      `改合作状态失败 HTTP ${change.status()} body=${body.slice(0, 300)}`,
    ).toBeTruthy();
    expect((JSON.parse(body) as { cooperation_status: string }).cooperation_status).toBe(
      "cooperated",
    );
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
    expect(
      view.ok(),
      `签署视图失败 HTTP ${view.status()} body=${viewBody.slice(0, 300)}`,
    ).toBeTruthy();
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
    expect(
      upload.ok(),
      `签名上传失败 HTTP ${upload.status()} body=${uploadBody.slice(0, 200)}`,
    ).toBeTruthy();
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
    expect(
      signed.ok(),
      `商户签署失败 HTTP ${signed.status()} body=${signedBody.slice(0, 300)}`,
    ).toBeTruthy();
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
  const read = (relativePath: string): string =>
    fs.readFileSync(path.resolve(MINIAPP, relativePath), "utf8");

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
  const createTs = read("pages/merchant/agreement/create/index.ts");
  const createWxml = read("pages/merchant/agreement/create/index.wxml");
  expect(createTs).not.toMatch(/已提交审核/);
  // 发起页的副标题与按钮文案也不能残留审核口径（REQ-IT5-03）
  expect(createWxml).not.toContain("提交审核");
  expect(createWxml).not.toContain("由运营审核");
});

test("REQ-IT5-04 发起协议签署人来自门店经纪人（接口 + 源码断言）", async () => {
  // —— 接口侧：门店经纪人列表就是签署人候选来源 ——
  const { ctx, dispose } = await createApiContext();
  let brokerName = "";
  try {
    const created = await ctx.post("/api/v1/admin/merchant/brokers", {
      data: {
        name: `${MARK}经纪人`,
        phone: BROKER_PHONE,
        store_id: storeId,
        remark: `${MARK} 签署人`,
      },
    });
    const body = await created.text();
    expect(
      created.ok(),
      `建经纪人失败 HTTP ${created.status()} body=${body.slice(0, 300)}`,
    ).toBeTruthy();
    const broker = JSON.parse(body) as { name: string; phone_masked: string };
    brokerName = broker.name;
    // 接口只回脱敏手机号（页面因此保留手填手机号），且不得回明文
    expect(broker.phone_masked).toMatch(/^\d{3}\*{4}\d{4}$/);
    expect(broker).not.toHaveProperty("phone");
  } finally {
    await dispose();
  }

  const cCtx = await cApi();
  try {
    const brokers = await cCtx.get(`/api/v1/public/merchant/stores/${storeId}/brokers`);
    expect(brokers.ok(), `门店经纪人列表失败 HTTP ${brokers.status()}`).toBeTruthy();
    const list = (await brokers.json()) as Array<{ name: string; phone_masked: string }>;
    expect(list.map((item) => item.name)).toContain(brokerName);
    expect(list.every((item) => Boolean(item.phone_masked))).toBe(true);

    // 用经纪人姓名作为签署人发起协议：落库的签署人即经纪人，不再手填任意姓名
    const agreement = await cCtx.post("/api/v1/public/merchant/agreements", {
      data: {
        subject_type: "store",
        store_id: storeId,
        template_id: templateId,
        signer_name: brokerName,
        signer_phone: SIGNER_PHONE,
        remark: `${MARK} 经纪人签署人`,
      },
    });
    const agreementBody = await agreement.text();
    expect(
      agreement.ok(),
      `以经纪人作为签署人发起失败 HTTP ${agreement.status()} body=${agreementBody.slice(0, 300)}`,
    ).toBeTruthy();
    expect((JSON.parse(agreementBody) as { signer_name: string }).signer_name).toBe(brokerName);
  } finally {
    await cCtx.dispose();
  }

  // —— 源码侧：页面确实是「选经纪人 + 手机号手填」的接线 ——
  const createTs = fs.readFileSync(
    path.resolve(MINIAPP, "pages/merchant/agreement/create/index.ts"),
    "utf8",
  );
  const createWxml = fs.readFileSync(
    path.resolve(MINIAPP, "pages/merchant/agreement/create/index.wxml"),
    "utf8",
  );

  // 选中门店后拉门店经纪人列表（与拜访登记页同源端点）
  expect(createTs).toMatch(/public\/merchant\/stores\/\$\{storeId\}\/brokers/);
  expect(createTs).toMatch(/onSelectSigner/);
  expect(createTs).toMatch(/signerLabels/);
  // 经纪人手机号只回脱敏值，因此手机号仍保留手填入口
  expect(createTs).toMatch(/phone_masked/);

  // 有经纪人时用 picker 选择，无经纪人时退回手填
  expect(createWxml).toMatch(/<picker[\s\S]{0,200}?bindchange="onSelectSigner"/);
  expect(createWxml).toContain("请选择门店经纪人");
  expect(createWxml).toContain("门店暂无经纪人，可填写签署人");
  expect(createWxml).toContain("签署人手机号");
});

test("REQ-IT5-05 门店无经纪人时可在发起页直接补录经纪人（接口 + 源码断言）", async () => {
  // —— 接口侧：员工在门店下新增经纪人并立即绑定，重复/跨店给出明确冲突 ——
  const { ctx, dispose } = await createApiContext();
  let emptyStoreId = "";
  try {
    const store = await ctx.post("/api/v1/admin/merchant/stores", {
      data: {
        company_id: companyId,
        store_name: `${MARK}无经纪人门店`,
        district: "浦东新区",
        business_circle: "陆家嘴商圈",
        address: `${MARK}无经纪人路 2 号`,
        lng: 121.5 + (Number(MARK.slice(-4)) % 300) / 1000,
        lat: 31.1 + (Number(MARK.slice(-4)) % 300) / 1000,
        contact_name: "迭代五补录",
        contact_phone: `139${MARK.slice(-8)}`,
        cooperation_status: "not_cooperated",
        force_create_reason: "E2E 迭代 5 REQ-IT5-05：坐标唯一但命中历史残留门店",
      },
    });
    const storeBody = await store.text();
    expect(
      store.ok(),
      `建门店失败 HTTP ${store.status()} body=${storeBody.slice(0, 300)}`,
    ).toBeTruthy();
    emptyStoreId = (JSON.parse(storeBody) as { store: { id: string } }).store.id;
  } finally {
    await dispose();
  }

  const cCtx = await cApi();
  try {
    // 前提：新门店只有建店联系人自动建档的经纪人（REQ-IT5-06），没有其他经纪人
    const before = await cCtx.get(`/api/v1/public/merchant/stores/${emptyStoreId}/brokers`);
    expect(before.ok(), `空门店经纪人列表失败 HTTP ${before.status()}`).toBeTruthy();
    const beforeList = (await before.json()) as Array<{ name: string }>;
    expect(beforeList).toHaveLength(1);
    expect(beforeList[0].name).toBe("迭代五补录");

    // 补录：直接新增并绑定到该门店
    const created = await cCtx.post(`/api/v1/public/merchant/stores/${emptyStoreId}/brokers`, {
      data: { name: `${MARK}补录经纪人`, phone: BROKER_PHONE2, remark: `${MARK} 发起页补录` },
    });
    const createdBody = await created.text();
    expect(
      created.ok(),
      `补录经纪人失败 HTTP ${created.status()} body=${createdBody.slice(0, 300)}`,
    ).toBeTruthy();
    const broker = JSON.parse(createdBody) as {
      id: string;
      name: string;
      store_id: string;
      bind_status: string;
      phone_masked: string;
    };
    expect(broker.store_id).toBe(emptyStoreId);
    expect(broker.bind_status).toBe("bound");
    expect(broker.phone_masked).toMatch(/^\d{3}\*{4}\d{4}$/);

    // 补录后立即成为签署人候选项
    const after = await cCtx.get(`/api/v1/public/merchant/stores/${emptyStoreId}/brokers`);
    const list = (await after.json()) as Array<{ id: string }>;
    expect(list.map((item) => item.id)).toContain(broker.id);
    expect(list).toHaveLength(2);

    // 重复补录同一手机号 → 409（同店）
    const dup = await cCtx.post(`/api/v1/public/merchant/stores/${emptyStoreId}/brokers`, {
      data: { name: `${MARK}补录经纪人`, phone: BROKER_PHONE2 },
    });
    expect(dup.status()).toBe(409);
    expect(((await dup.json()) as { message: string }).message).toContain("已在本门店");

    // 跨店补录同一手机号 → 409（提示走换绑流程）
    const cross = await cCtx.post(`/api/v1/public/merchant/stores/${storeId}/brokers`, {
      data: { name: `${MARK}补录经纪人`, phone: BROKER_PHONE2 },
    });
    expect(cross.status()).toBe(409);
    expect(((await cross.json()) as { message: string }).message).toContain("换绑");
  } finally {
    await cCtx.dispose();
  }

  // —— 源码侧：无经纪人时页面提供补录入口与弹层 ——
  const createTs = fs.readFileSync(
    path.resolve(MINIAPP, "pages/merchant/agreement/create/index.ts"),
    "utf8",
  );
  const createWxml = fs.readFileSync(
    path.resolve(MINIAPP, "pages/merchant/agreement/create/index.wxml"),
    "utf8",
  );

  expect(createTs).toMatch(/onOpenBrokerModal/);
  expect(createTs).toMatch(/onSaveBroker/);
  // 补录走员工侧端点，且是 POST
  expect(createTs).toMatch(
    /url: `\/public\/merchant\/stores\/\$\{storeId\}\/brokers`,\s*\n\s*method: "POST"/,
  );
  expect(createWxml).toContain("新增门店经纪人");
  expect(createWxml).toMatch(/wx:if="\{\{storeId && !signers\.length\}\}"/);
  expect(createWxml).toContain("新增后立即绑定到当前门店");
});

test("REQ-IT5-06 建店联系人自动建档为门店经纪人，重复手机号跳过不阻断建店", async () => {
  const { ctx, dispose } = await createApiContext();
  const contactPhone = `134${MARK.slice(-8)}`;
  let autoStoreId = "";
  let conflictStoreId = "";
  try {
    const payload = {
      company_id: companyId,
      // 与 beforeAll 的门店/后续门店错开，避免命中 500m 查重
      district: "浦东新区",
      business_circle: "陆家嘴商圈",
      contact_name: `${MARK}联系人`,
      contact_phone: contactPhone,
      cooperation_status: "not_cooperated",
      force_create_reason: "E2E 迭代 5 REQ-IT5-06：坐标唯一但命中历史残留门店",
    };

    const auto = await ctx.post("/api/v1/admin/merchant/stores", {
      data: {
        ...payload,
        store_name: `${MARK}自动建档门店`,
        address: `${MARK}自动建档路 3 号`,
        lng: 121.7 + (Number(MARK.slice(-4)) % 300) / 1000,
        lat: 31.5 + (Number(MARK.slice(-4)) % 300) / 1000,
      },
    });
    const autoBody = await auto.text();
    expect(
      auto.ok(),
      `建门店失败 HTTP ${auto.status()} body=${autoBody.slice(0, 300)}`,
    ).toBeTruthy();
    autoStoreId = (JSON.parse(autoBody) as { store: { id: string } }).store.id;

    // 同一手机号再建一家门店：跳过自动建档，建店仍然成功
    const conflict = await ctx.post("/api/v1/admin/merchant/stores", {
      data: {
        ...payload,
        store_name: `${MARK}冲突门店`,
        address: `${MARK}冲突路 4 号`,
        lng: 121.75 + (Number(MARK.slice(-4)) % 300) / 1000,
        lat: 31.55 + (Number(MARK.slice(-4)) % 300) / 1000,
      },
    });
    const conflictBody = await conflict.text();
    expect(
      conflict.ok(),
      `冲突建店失败 HTTP ${conflict.status()} body=${conflictBody.slice(0, 300)}`,
    ).toBeTruthy();
    conflictStoreId = (JSON.parse(conflictBody) as { store: { id: string } }).store.id;
    expect(conflictStoreId).not.toBe(autoStoreId);
  } finally {
    await dispose();
  }

  const cCtx = await cApi();
  try {
    // 自动建档并立即绑定：门店经纪人列表里就是建店联系人，手机号脱敏
    const linked = await cCtx.get(`/api/v1/public/merchant/stores/${autoStoreId}/brokers`);
    expect(linked.ok(), `自动建档门店经纪人列表失败 HTTP ${linked.status()}`).toBeTruthy();
    const brokers = (await linked.json()) as Array<{
      name: string;
      store_id: string;
      phone_masked: string;
    }>;
    expect(brokers).toHaveLength(1);
    expect(brokers[0].name).toBe(`${MARK}联系人`);
    expect(brokers[0].store_id).toBe(autoStoreId);
    expect(brokers[0].phone_masked).toMatch(/^\d{3}\*{4}\d{4}$/);

    // 冲突门店不重复建档：列表为空（原门店仍持有该手机号档案）
    const empty = await cCtx.get(`/api/v1/public/merchant/stores/${conflictStoreId}/brokers`);
    expect(empty.ok(), `冲突门店经纪人列表失败 HTTP ${empty.status()}`).toBeTruthy();
    expect((await empty.json()) as unknown[]).toHaveLength(0);
  } finally {
    await cCtx.dispose();
  }

  // —— 源码侧：建店页与后台表单都提示「联系人会自动成为门店经纪人」——
  const createWxml = fs.readFileSync(
    path.resolve(MINIAPP, "pages/merchant/store/create/index.wxml"),
    "utf8",
  );
  expect(createWxml).toContain("该联系人会成为门店经纪人");

  const adminForm = fs.readFileSync(
    path.resolve(__dirname, "../src/app/(main)/admin/merchant/stores/new/page.tsx"),
    "utf8",
  );
  expect(adminForm).toContain("保存后该手机号会自动建档为门店经纪人");

  const brokerService = fs.readFileSync(
    path.resolve(BACKEND, "services/merchant/broker.py"),
    "utf8",
  );
  expect(brokerService).toMatch(/def ensure_contact_broker\(/);
  expect(brokerService).toContain('source="store_contact"');

  const storeService = fs.readFileSync(path.resolve(BACKEND, "services/merchant/store.py"), "utf8");
  expect(storeService).toMatch(
    /_ensure_contact_broker\(store, actor_id=actor_id, request=request\)/,
  );
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
