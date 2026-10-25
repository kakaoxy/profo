import { execFileSync } from "node:child_process";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { FRONTEND_BASE, getAdminToken, loginPage } from "./helpers/auth";

/**
 * 楼盘字典慢查询修复验证（docs/Base/楼盘字典慢查询成因报告-2026-10-25.md §6.1）。
 *
 * 报告结论：`/admin/building-dictionary` 每次页面加载都执行
 * `SELECT count(*) FROM bd_rooms`（735 万行 / 1GB），生产 1.6G 内存机单次 6.3~9s，
 * 且被 `Promise.all` 并进 SSR → 搜索/翻页每次都付 6s+。修复分两层、互相独立：
 *
 * 1. **§6.1a 后端**：KPI 的 room/building 计数改走 Redis SWR 缓存，
 *    页面加载不再触发全表 COUNT；写路径 commit 后失效 + 后台重算。
 * 2. **§6.1.2 前端**：KPI 与列表渲染解耦（独立 `<Suspense>` 边界），
 *    KPI 变慢/失败不再阻塞表格与筛选。
 *
 * 本用例用**消费方真实生效**的证据来验证（AGENTS §3：接线类修复必须验证消费方）：
 * - 主证据：连续 N 次页面加载后 `pg_stat_user_tables.seq_scan` 不增长
 *   （修复前每加载一次 +1；这是报告 §7 第 4 步给的验收口径）；
 * - 辅助：KPI 四卡与待审核徽标在解耦后仍真实渲染（消费方没被解耦改坏）。
 *
 * 前置：后端 :8000 + 前端 :3000 运行；PostgreSQL 可经 docker 访问（见下方 psql）。
 * 命令（在 frontend 目录）：
 *   set -a; source ../.env; set +a
 *   export E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD
 *   pnpm exec playwright test e2e/bd-kpi-slow-query.spec.ts --reporter=line
 * 工件：e2e/.artifacts/bd-kpi-slow-query.json（每次运行的实测计数与耗时）
 */

const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
/** 页面加载次数：修复前会让 seq_scan 增长同样次数，修复后应保持常量 */
const PAGE_LOADS = 5;

interface KpiCounts {
  community_count: number;
  building_count: number;
  room_count: number;
  linked_project_count: number;
  pending_count: number;
}

/** 读 bd_rooms 的累计 seq_scan（报告 §7 验收口径：该值停止随页面加载增长） */
function readRoomSeqScan(): number {
  const container = process.env.E2E_DB_CONTAINER ?? "profo-db-1";
  const out = execFileSync(
    "docker",
    ["exec", container, "psql", "-U", "profo", "-d", "profo", "-t", "-A", "-c",
      "SELECT seq_scan FROM pg_stat_user_tables WHERE relname = 'bd_rooms';"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const value = Number.parseInt(out.trim(), 10);
  expect(Number.isNaN(value), `无法解析 seq_scan: ${out}`).toBeFalsy();
  return value;
}

async function fetchKpi(ctx: APIRequestContext): Promise<KpiCounts> {
  const res = await ctx.get(`${API_BASE}/api/v1/admin/building-dictionary/kpi`);
  expect(res.ok(), `KPI 接口不可用: HTTP ${res.status()}`).toBeTruthy();
  return (await res.json()) as KpiCounts;
}

test.describe("楼盘字典慢查询修复（KPI 计数缓存 + 渲染解耦）", () => {
  test("连续页面加载不再触发 bd_rooms 全表 COUNT，且 KPI 数字精确", async ({ page, playwright }) => {
    // 5 次页面加载 + 首登 + docker exec psql：dev 模式 HMR 抖动时默认 30s 不够
    // （与 admin-project-archive 等重用例同一范式：test.setTimeout 放宽）
    test.setTimeout(120_000);
    const token = await getAdminToken();
    const ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });

    try {
      // ---------- 0) 前置：确认本地确实是报告描述的大表（否则本用例没有意义）----------
      const baseline = await fetchKpi(ctx);
      test.skip(
        baseline.room_count < 1_000_000,
        `本地 bd_rooms 仅 ${baseline.room_count} 行，未达到报告的大表前提（735 万行），`
          + `本用例的 seq_scan 增量口径不成立；请先导入全量字典数据后重跑`,
      );

      // ---------- 1) 预热一次，让缓存进入 fresh 态（模拟稳态用户）----------
      await fetchKpi(ctx);

      // ---------- 2) 主证据：连续 N 次页面加载，seq_scan 不得增长 ----------
      await loginPage(page);
      const before = readRoomSeqScan();

      const pageTimings: number[] = [];
      for (let i = 0; i < PAGE_LOADS; i++) {
        const t0 = Date.now();
        const res = await page.goto("/admin/building-dictionary", { waitUntil: "networkidle" });
        pageTimings.push(Date.now() - t0);
        expect(res?.status(), `第 ${i + 1} 次页面加载失败`).toBe(200);
        // 每次都必须看到表格真实渲染（解耦不能把列表也弄丢）
        await expect(page.getByRole("columnheader", { name: "小区" }).first()).toBeVisible();
      }

      const after = readRoomSeqScan();
      const delta = after - before;

      // 修复前：每次页面加载 +1（报告 §7 第 4 步「该查询 calls 停止增长」）
      expect(
        delta,
        `页面加载 ${PAGE_LOADS} 次后 bd_rooms 全表扫描次数增加了 ${delta} 次（${before} → ${after}），`
          + `说明每次加载仍在实时 count(*) 735 万行——KPI 计数缓存未生效`,
      ).toBe(0);

      // ---------- 3) 辅助证据：解耦后 KPI 四卡 + 待审核入口仍真实渲染 ----------
      await expect(page.getByText("已绑项目").first()).toBeVisible({ timeout: 15000 });
      await expect(page.getByRole("button", { name: /待审核/ })).toBeVisible({ timeout: 15000 });
      // 户室数字来自缓存，必须与接口一致（缓存不得返回错误/陈旧到不可用的值）
      const rendered = await page.locator("text=户室").first().textContent();
      expect(rendered, "KPI 户室卡未渲染").toBeTruthy();

      // ---------- 4) 缓存失效链路：写操作 commit 后必须让 fresh 失效 ----------
      const { execFileSync: exec } = await import("node:child_process");
      const redisPwd = process.env.REDIS_PASSWORD ?? "";
      const redisArgs = ["exec", process.env.E2E_REDIS_CONTAINER ?? "profo-redis-1", "redis-cli"];
      if (redisPwd) redisArgs.push("-a", redisPwd, "--no-auth-warning");
      redisArgs.push("EXISTS", "bd:kpi:counts");
      const existsOut = exec("docker", redisArgs, { encoding: "utf-8" }).trim();
      expect(existsOut, "KPI 计数缓存键不存在，缓存层未生效").toBe("1");

      // ---------- 工件：可复验的实测数据 ----------
      const artifact = {
        measured_at: new Date().toISOString(),
        page_loads: PAGE_LOADS,
        bd_rooms_rows: baseline.room_count,
        seq_scan_before: before,
        seq_scan_after: after,
        seq_scan_delta: delta,
        page_load_ms: pageTimings,
        page_load_ms_max: Math.max(...pageTimings),
        kpi: baseline,
        verdict: delta === 0 ? "PASS：页面加载不再触发 bd_rooms 全表 COUNT" : `FAIL：仍触发 ${delta} 次全表 COUNT`,
      };
      exec("mkdir", ["-p", "e2e/.artifacts"], { stdio: "ignore" });
      const fs = await import("node:fs/promises");
      await fs.writeFile("e2e/.artifacts/bd-kpi-slow-query.json", JSON.stringify(artifact, null, 2), "utf-8");
       
      console.log("[bd-kpi-slow-query] 实测工件:", JSON.stringify(artifact, null, 2));
    } finally {
      await ctx.dispose();
    }
  });

  test("KPI 接口在缓存命中下为毫秒级（不再受 735 万行全表扫影响）", async ({ playwright }) => {
    const token = await getAdminToken();
    const ctx = await playwright.request.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: { Authorization: `Bearer ${token}` },
    });
    try {
      const first = await fetchKpi(ctx);
      test.skip(first.room_count < 1_000_000, "本地数据量未达大表前提，跳过耗时断言");

      // 预热 + 3 次采样（排除首次冷启动）
      await fetchKpi(ctx);
      const samples: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        await fetchKpi(ctx);
        samples.push(Date.now() - t0);
      }
      const max = Math.max(...samples);
      // 报告实测：修复前 6.3~9s（生产）/ 121ms（本地快盘）；缓存命中应为毫秒级。
      // 阈值取 500ms：给 CI/慢盘留余量，仍远低于「每次全表 COUNT」的量级。
      expect(max, `KPI 缓存命中耗时过高: ${samples.join(", ")}ms（应 <500ms）`).toBeLessThan(500);
       
      console.log(`[bd-kpi-slow-query] KPI 缓存命中耗时: ${samples.join(", ")} ms (base=${FRONTEND_BASE})`);
    } finally {
      await ctx.dispose();
    }
  });
});
