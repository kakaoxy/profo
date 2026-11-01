#!/usr/bin/env node
/**
 * 临时造数脚本（审计用，审计结束后删除）：为商户模块 UI 审计准备可视化数据。
 * 凭据从 frontend/.env.local 读取，严禁硬编码或打印。
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const ENV_FILE = path.join(ROOT, "frontend/.env.local");

function loadEnv() {
  const text = fs.readFileSync(ENV_FILE, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const API = env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const USER = env.E2E_ADMIN_USER;
const PASS = env.E2E_ADMIN_PASSWORD;
if (!USER || !PASS) throw new Error("缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD");

async function call(method, url, token, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

const login = await call("POST", "/api/v1/auth/login", null, { username: USER, password: PASS });
const token = login.access_token;
if (!token) throw new Error("登录失败：无 access_token");

const suffix = Date.now().toString().slice(-6);
const company = await call("POST", "/api/v1/admin/merchant/companies", token, {
  company_name: `【审计】河畔餐饮有限公司${suffix}`,
  contact_name: "王经理",
  contact_phone: "13800001234",
  remark: "UI 审计造数",
});

const mkStore = (name, district, circle, status, lng, lat, phone) =>
  call("POST", "/api/v1/admin/merchant/stores", token, {
    company_id: company.id,
    store_name: name,
    province: "上海市",
    city: "上海市",
    district,
    business_circle: circle,
    address: `上海市${district}${circle}${name}1号`,
    lng,
    lat,
    contact_name: "李店长",
    contact_phone: phone,
    cooperation_status: status,
    remark: "UI 审计造数",
  });

const storeA = await mkStore(`【审计】望江店${suffix}`, "浦东新区", "陆家嘴", "negotiating", 121.5057, 31.2397, "13911110001");
const storeB = await mkStore(`【审计】临街店${suffix}`, "徐汇区", "徐家汇", "not_cooperated", 121.4365, 31.1938, "13911110002");
const storeC = await mkStore(`【审计】老街店${suffix}`, "黄浦区", "南京东路", "not_cooperated", 121.4799, 31.2353, "13911110003");

const brokerA = await call("POST", "/api/v1/admin/merchant/brokers", token, {
  name: "【审计】张经纪",
  phone: "13700003333",
  store_id: storeA.store.id,
  remark: "UI 审计造数",
});
const brokerB = await call("POST", "/api/v1/admin/merchant/brokers", token, {
  name: "【审计】赵经纪",
  phone: "13700004444",
  store_id: storeB.store.id,
  remark: "UI 审计造数",
});

const visit = await call("POST", "/api/v1/admin/merchant/stores/" + storeA.store.id + "/visits", token, {
  contact_name: "李店长",
  contact_phone: "13900002222",
  lng: 121.5057,
  lat: 31.2397,
  address: "上海市浦东新区陆家嘴望江店1号",
  remark: "UI 审计造数",
}).catch((err) => ({ error: String(err.message).slice(0, 200) }));

const template = await call("POST", "/api/v1/admin/merchant/agreement-templates", token, {
  template_name: `【审计】单店合作协议${suffix}`,
  cooperation_type: "store",
  content: "第一条 合作内容……\n第二条 结算方式……",
  version: "v1",
}).catch((err) => ({ error: String(err.message).slice(0, 300) }));

let agreement = null;
if (template && template.id) {
  agreement = await call("POST", "/api/v1/admin/merchant/agreements", token, {
    subject_type: "store",
    store_id: storeA.store.id,
    template_id: template.id,
    signer_name: "李店长",
    signer_phone: "13900002222",
    expire_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 20).toISOString(),
    remark: "UI 审计造数",
  }).catch((err) => ({ error: String(err.message).slice(0, 300) }));
}

console.log(
  JSON.stringify(
    {
      company_id: company.id,
      store_ids: [storeA.store.id, storeB.store.id, storeC.store.id],
      broker_ids: [brokerA.id, brokerB.id],
      visit,
      template_id: template?.id ?? null,
      agreement_id: agreement?.id ?? null,
      errors: { visit: visit?.error, template: template?.error, agreement: agreement?.error },
    },
    null,
    2,
  ),
);
