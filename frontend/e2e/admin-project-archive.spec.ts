import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 项目归档状态 E2E（SPEC-project-archive）
 *
 * 覆盖：
 * 1. G1：sold 项目归档前 PUT contract_no / owners / signing_materials 全部持久化
 *    （旧 `_filter_allowed_fields` 白名单已移除，接口不再静默丢弃字段）；
 * 2. 详情页顶栏「归档」→ 弹窗（日期默认今天 + 说明）提交 → 徽标出现、编辑置灰、删除入口消失；
 * 3. 归档后直接调 PUT → 400 且 message 含「已归档」（后端写锁 Fail Loud）；
 * 4. 列表按「已归档 / 未归档」筛选：归档项目按态出现 + 名称列锁形徽标；
 * 5. 「反归档」原因必填校验 → 提交成功 → 徽标消失、编辑恢复可用、PUT 200。
 *
 * ⚠️ 显式偏差：spec §6 步骤 1 提到「详情页上传附件」，但 sold 视图（SoldView）当前
 * 不渲染附件库 / 项目信息卡（spec §1 F3 已记录该现状，§3.4 未要求新增 sold 编辑 UI），
 * 因此 G1 按 spec §2 验收口径在 API 层断言（PUT contract_no/owners/signing_materials 持久化）。
 *
 * 可复跑：cd frontend && npx playwright test e2e/admin-project-archive.spec.ts
 * 依赖：本地后端 :8000 + 前端 :3000 调试进程；账号读 E2E_ADMIN_USER/E2E_ADMIN_PASSWORD。
 * 工件：e2e/.artifacts/project-archive-*.png（归档态详情 / 列表筛选 / 反归档后详情）。
 */

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PROJECT_NAME_SALT = `归档E2E-${RUN_ID}`;
const SCREENSHOT_DIR = "e2e/.artifacts";

function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface CreatedProject {
  id: string;
  name: string;
  contractNo: string;
}

/** 造一个 sold 项目（signing → selling → 确认成交），返回 id / 名称 / 合同编号 */
async function createSoldProject(ctx: APIRequestContext): Promise<CreatedProject> {
  const contractNo = `E2EARCH${RUN_ID.toUpperCase()}`;
  const createRes = await ctx.post("/api/v1/projects", {
    data: {
      community_name: PROJECT_NAME_SALT,
      address: "1 号楼 101",
      business_form: "agent",
      contract_no: contractNo,
      signing_price: 300,
    },
  });
  expect(
    createRes.ok(),
    `创建项目失败: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const created = (await createRes.json()) as { id: string; name: string };

  // signing → selling（validate_transition 仅约束 sold/ended 目标状态）
  const listingRes = await ctx.put(`/api/v1/projects/${created.id}/status`, {
    data: { status: "selling", listing_date: todayISO(), list_price: 480 },
  });
  expect(listingRes.ok(), `上架状态流转失败: ${listingRes.status()}`).toBeTruthy();

  // selling → sold（确认成交）
  const soldRes = await ctx.post(`/api/v1/projects/${created.id}/complete`, {
    data: { sold_price: 500, sold_date: todayISO() },
  });
  expect(soldRes.ok(), `确认成交失败: ${soldRes.status()}`).toBeTruthy();

  return { id: created.id, name: created.name, contractNo };
}

/** 拉取项目详情（API 断言用） */
async function getProject(ctx: APIRequestContext, id: string) {
  const res = await ctx.get(`/api/v1/projects/${id}`);
  expect(res.ok(), `获取项目详情失败: ${res.status()}`).toBeTruthy();
  return (await res.json()) as {
    community_id: string | null;
    contract_no: string | null;
    signing_materials: { filename: string; url: string }[] | null;
    owners: { owner_name: string | null }[];
    is_archived: boolean;
    archived_at: string | null;
    archived_note: string | null;
  };
}

/** 等待详情页主视图渲染完成（顶栏面包屑 + Hero 项目名） */
async function gotoDetail(page: Page, project: CreatedProject) {
  await page.goto(`/admin/projects/${project.id}`);
  await expect(page.getByRole("heading", { level: 1, name: project.name })).toBeVisible({
    timeout: 20000,
  });
}

test.describe("项目归档状态（sold 可写 → 归档锁定 → 反归档恢复）", () => {
  test.describe.configure({ mode: "serial" });
  // 单用例串联造数 + 归档 + 列表筛选 + 反归档，耗时远超默认 30s（dev 首屏编译 + 多次导航）
  test.setTimeout(180_000);

  // 造数项目 id：测试体本身超时被杀时 finally 可能来不及执行，
  // 用例结束后再兜底清理一次（造出的 sold 项目会排在列表首位，
  // 污染依赖 items[0] 的其他 E2E 用例）
  let leftoverProjectId: string | null = null;

  test.afterAll(async () => {
    if (!leftoverProjectId) return;
    const { ctx, dispose } = await createApiContext();
    try {
      await ctx.post(`/api/v1/projects/${leftoverProjectId}/unarchive`, {
        data: { reason: "E2E 兜底清理" },
      });
      await ctx.delete(`/api/v1/projects/${leftoverProjectId}`);
    } catch {
      // 项目已不存在（删除过）时静默忽略：清理是尽力而为
    } finally {
      await dispose();
    }
  });

  test.beforeEach(async ({ page }) => {
    await loginPage(page);
  });

  test("归档前 sold 项目可写 / 归档锁定 / 列表筛选 / 反归档恢复", async ({ page }) => {
    const { ctx, dispose } = await createApiContext();
    let project: CreatedProject | null = null;

    try {
      // ---------- 1. 造 sold 项目 + G1：归档前任意字段可写 ----------
      project = await createSoldProject(ctx);
      leftoverProjectId = project.id;
      const soldProject = project;

      const newContractNo = `${soldProject.contractNo}-R1`;
      const putRes = await ctx.put(`/api/v1/projects/${soldProject.id}`, {
        data: {
          contract_no: newContractNo,
          signing_price: 320,
          owners: [
            { owner_name: "归档业主", owner_phone: "13800000001", relation_type: "业主" },
            { owner_name: "归档共有人", owner_phone: "13800000002", relation_type: "共有人" },
          ],
          signing_materials: [
            {
              filename: "e2e-signing.pdf",
              url: "https://example.com/e2e-signing.pdf",
              category: "contract_agreement",
              fileType: "pdf",
              size: 2048,
            },
          ],
        },
      });
      expect(putRes.status(), `sold 项目 PUT 应 200（白名单已移除）: ${await putRes.text()}`).toBe(
        200,
      );

      const afterWrite = await getProject(ctx, soldProject.id);
      expect(afterWrite.contract_no).toBe(newContractNo);
      expect(afterWrite.owners.map((o) => o.owner_name)).toEqual(
        expect.arrayContaining(["归档业主", "归档共有人"]),
      );
      expect((afterWrite.signing_materials ?? []).map((m) => m.filename)).toContain(
        "e2e-signing.pdf",
      );

      // ---------- 2. UI 归档 ----------
      await gotoDetail(page, soldProject);
      await expect(page.getByText("已归档", { exact: true })).toHaveCount(0);
      // 归档前：编辑与删除入口均在
      await expect(page.getByRole("button", { name: "编辑", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "删除", exact: true })).toBeVisible();

      await page.getByRole("button", { name: "归档", exact: true }).click();
      const archiveDialog = page.getByRole("dialog");
      await expect(archiveDialog).toBeVisible();
      await expect(archiveDialog.getByText("归档项目", { exact: true })).toBeVisible();
      // 归档日期默认今天（弹窗必填项预填）
      await expect(archiveDialog.locator('input[type="date"]')).toHaveValue(todayISO());
      await archiveDialog.getByLabel("归档说明").fill("E2E 归档：材料已补齐");

      // 提交（归档走 Server Action，请求打到 Next 服务端而非 /api/v1/...，
      // 故不监听 API 响应，改用弹窗关闭 + API 轮询确认服务端已落库）
      await archiveDialog.getByRole("button", { name: "确认归档" }).click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20000 });
      await expect
        .poll(async () => (await getProject(ctx, soldProject.id)).is_archived, { timeout: 20000 })
        .toBe(true);

      // 归档态视觉与写入口收敛
      await expect(page.getByText("已归档", { exact: true }).first()).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByRole("button", { name: "编辑", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "删除", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "反归档", exact: true })).toBeVisible();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/project-archive-detail-archived.png` });

      // 归档字段落库
      const archived = await getProject(ctx, soldProject.id);
      expect(archived.is_archived).toBe(true);
      expect(archived.archived_at).toBe(todayISO());
      expect(archived.archived_note).toBe("E2E 归档：材料已补齐");

      // ---------- 3. 后端写锁：PUT → 400 且 message 含「已归档」 ----------
      const lockedRes = await ctx.put(`/api/v1/projects/${soldProject.id}`, {
        data: { address: "归档后不应写入的地址" },
      });
      expect(lockedRes.status()).toBe(400);
      const lockedBody = (await lockedRes.json()) as { message?: string };
      expect(lockedBody.message ?? "").toContain("已归档");
      // DB 未变更
      const afterLocked = await getProject(ctx, soldProject.id);
      expect(afterLocked.contract_no).toBe(newContractNo);

      // ---------- 3b. 归档锁覆盖字典绑定端点（回归：DictionaryLinkService 曾漏接） ----------
      // 造一个字典小区作为绑定目标（先联小区级，不涉及楼栋/户室）
      const communityRes = await ctx.post("/api/v1/admin/building-dictionary/communities", {
        data: { name: `__E2E_ARCHIVE_DICT_${RUN_ID}__`, district: "虹口", business_circle: "E2E" },
      });
      expect(
        communityRes.ok(),
        `字典小区创建失败: ${communityRes.status()} ${await communityRes.text()}`,
      ).toBeTruthy();
      const dictCommunityId = ((await communityRes.json()) as { id: string }).id;

      const linkRes = await ctx.put(`/api/v1/admin/projects/${soldProject.id}/dictionary-link`, {
        data: { community_id: dictCommunityId },
      });
      expect(linkRes.status(), "归档项目字典绑定必须 400").toBe(400);
      const linkBody = (await linkRes.json()) as { message?: string };
      expect(linkBody.message ?? "").toContain("已归档");

      const unlinkRes = await ctx.delete(
        `/api/v1/admin/projects/${soldProject.id}/dictionary-link`,
      );
      expect(unlinkRes.status(), "归档项目解除字典绑定必须 400").toBe(400);
      expect(((await unlinkRes.json()) as { message?: string }).message ?? "").toContain("已归档");

      const afterDict = await getProject(ctx, soldProject.id);
      expect(afterDict.community_id).toBeNull();

      // ---------- 4. 列表归档筛选（已归档出现 + 徽标 / 未归档消失） ----------
      await page.goto("/admin/projects");
      const archivedSelect = page.locator('[role="combobox"]').filter({ hasText: "全部归档状态" });
      await expect(archivedSelect).toBeVisible({ timeout: 20000 });
      await archivedSelect.click();
      await page.getByRole("option", { name: "已归档", exact: true }).click();
      await expect(page).toHaveURL(/is_archived=true/);

      const archivedRow = page.getByRole("row").filter({ hasText: soldProject.name });
      await expect(archivedRow).toBeVisible({ timeout: 20000 });
      await expect(archivedRow.getByText("已归档", { exact: true })).toBeVisible();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/project-archive-list-filter.png` });

      // 列表行操作菜单接线：归档后仅保留「反归档」，删除入口消失（后端亦 400）
      await archivedRow.getByRole("button", { name: "操作菜单" }).click();
      await expect(page.getByRole("menuitem", { name: "反归档" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "删除" })).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("menuitem", { name: "反归档" })).toBeHidden();

      // 切「未归档」→ 已归档项目不再出现
      await page.locator('[role="combobox"]').filter({ hasText: "已归档" }).first().click();
      await page.getByRole("option", { name: "未归档", exact: true }).click();
      await expect(page).toHaveURL(/is_archived=false/);
      await expect(page.getByRole("row").filter({ hasText: soldProject.name })).toHaveCount(0, {
        timeout: 20000,
      });

      // ---------- 5. UI 反归档（原因必填） ----------
      await gotoDetail(page, soldProject);
      await page.getByRole("button", { name: "反归档", exact: true }).click();
      const unarchiveDialog = page.getByRole("dialog");
      await expect(unarchiveDialog).toBeVisible();
      await expect(unarchiveDialog.getByText("反归档项目", { exact: true })).toBeVisible();

      const confirmUnarchive = unarchiveDialog.getByRole("button", { name: "确认反归档" });
      // 原因为空 → 提交按钮禁用（必填校验）
      await expect(confirmUnarchive).toBeDisabled();
      await unarchiveDialog.getByLabel("反归档原因").fill("E2E 需补录附件");

      await confirmUnarchive.click();
      await expect(page.getByRole("dialog")).toBeHidden({ timeout: 20000 });
      await expect
        .poll(async () => (await getProject(ctx, soldProject.id)).is_archived, { timeout: 20000 })
        .toBe(false);

      // 反归档后：徽标消失、编辑恢复、写接口 200
      await expect(page.getByText("已归档", { exact: true })).toHaveCount(0, { timeout: 15000 });
      await expect(page.getByRole("button", { name: "编辑", exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: "删除", exact: true })).toBeVisible();
      await page.screenshot({ path: `${SCREENSHOT_DIR}/project-archive-detail-unarchived.png` });

      const unarchived = await getProject(ctx, soldProject.id);
      expect(unarchived.is_archived).toBe(false);
      expect(unarchived.archived_at).toBeNull();
      expect(unarchived.archived_note).toBeNull();

      // 字典绑定端点同步恢复（证明 3b 的 400 来自归档锁，而非端点自身故障）
      const relinkRes = await ctx.put(`/api/v1/admin/projects/${soldProject.id}/dictionary-link`, {
        data: { community_id: dictCommunityId },
      });
      expect(relinkRes.status(), "反归档后字典绑定应恢复可用").toBe(200);
      await ctx.delete(`/api/v1/admin/projects/${soldProject.id}/dictionary-link`);

      const writableRes = await ctx.put(`/api/v1/projects/${soldProject.id}`, {
        data: { address: "反归档后可写入的地址" },
      });
      expect(writableRes.status()).toBe(200);
      const afterWritable = await ctx.get(`/api/v1/projects/${soldProject.id}`);
      expect(((await afterWritable.json()) as { address: string }).address).toBe(
        "反归档后可写入的地址",
      );
    } finally {
      // 清理：删除造数项目（已归档需先反归档，此处流程结束时必为未归档）
      if (project) {
        await ctx
          .post(`/api/v1/projects/${project.id}/unarchive`, { data: { reason: "E2E 清理" } })
          .catch(() => undefined);
        await ctx.delete(`/api/v1/projects/${project.id}`).catch(() => undefined);
      }
      await dispose();
    }
  });
});
