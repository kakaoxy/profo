import { expect, test } from "@playwright/test";
import { createApiContext } from "./helpers/auth";

/**
 * BR-29 审核池三场景修复 E2E（2026-10-20）.
 *
 * 覆盖（运营反馈的三个未覆盖场景）：
 * 1. 审核「确认新增」时可修正名称 —— 楼栋号尾部单个「号」自动剥离，
 *    且落库值经 API 读回验证（不只验证前端提示）；
 * 2. 「用已有的」在无任何目标（含待审兄弟）时不再推荐/不可提交 ——
 *    默认动作降级为「确认新增」，提交按钮可用且能落库；
 * 3. 审核通过后可在抽屉里改名（楼栋/户室/小区），且**消费方真实生效**
 *    （项目详情 building_no 读回新名 —— AGENTS「接线类修复必须验证消费方」）。
 *
 * 造数策略：全部用工位前缀 ``__E2E_BR29_<ts>`` 隔离，finally 清理；
 * 断言的依据一律是**后端读回**，不是界面 toast。
 */

interface Api {
  ctx: Awaited<ReturnType<typeof createApiContext>>["ctx"];
  dispose: () => Promise<void>;
}

const PREFIX = `__E2E_BR29_${Date.now() % 1000000}__`;

/** 创建独立 API 上下文（每用例一个，避免污染） */
async function api(): Promise<Api> {
  const { ctx, dispose } = await createApiContext();
  return { ctx, dispose };
}

/** 建小区，返回 id */
async function createCommunity(a: Api, name: string): Promise<string> {
  const res = await a.ctx.post("/api/v1/admin/building-dictionary/communities", {
    data: { name, district: "浦东", business_circle: "金杨" },
  });
  expect(res.ok(), `建小区失败: ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

/** 提交 pending 条目，返回 pending_id */
async function submitPending(
  a: Api,
  body: {
    kind: "community" | "building" | "room";
    name: string;
    parent_kind?: string;
    parent_id?: string;
    source_type?: string;
  },
): Promise<number> {
  const res = await a.ctx.post("/api/v1/admin/building-dictionary/pending", {
    data: { ...body, source_type: body.source_type ?? "admin" },
  });
  expect(res.ok(), `提交 pending 失败: ${res.status()} ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { pending_id: number }).pending_id;
}

/** 审核 resolve */
async function resolve(a: Api, entryId: number, data: Record<string, unknown>) {
  return a.ctx.post(`/api/v1/admin/building-dictionary/review/${entryId}/resolve`, { data });
}

/** 读小区下全部楼栋名（含 pending） */
async function listBuildingNos(a: Api, communityId: string): Promise<{ building_no: string; pending: boolean }[]> {
  const res = await a.ctx.get(
    `/api/v1/admin/building-dictionary/communities/${communityId}/buildings?page=1&page_size=100`,
  );
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { items: { building_no: string; pending: boolean }[] }).items;
}

// 串行执行：后端 /auth/login 限流 5 次/分钟，并行 worker 各自登录会撞 429 →
// 测试在 30s 超时前拿不到 token（假失败）。串行 + 单 worker 是本 spec 的硬约束。
test.describe.configure({ mode: "serial" });

test.describe("BR-29 审核三场景", () => {
  test("场景1：确认新增时可修正名称（尾部「号」自动剥离）", async () => {
    const a = await api();
    const communityName = `${PREFIX}场景1小区`;
    let communityId: string | null = null;
    try {
      communityId = await createCommunity(a, communityName);
      // 录入端提交「金杨路660弄21号」（模拟运营输入带「号」）
      const pendingId = await submitPending(a, {
        kind: "building",
        name: "金杨路660弄21号",
        parent_kind: "community",
        parent_id: communityId,
      });

      // 审核通过新增，不传 name → 后端同样自动归一（写入层统一收口）
      const res = await resolve(a, pendingId, { action: "create" });
      expect(res.ok(), `resolve 失败: ${res.status()} ${await res.text()}`).toBeTruthy();
      const body = (await res.json()) as { resolved_name?: string | null };
      expect(body.resolved_name).toBe("金杨路660弄21");

      // 断言 1：字典落库值已剥离尾部「号」（后端读回，不是看前端）
      const nos = await listBuildingNos(a, communityId);
      expect(nos.map((b) => b.building_no)).toContain("金杨路660弄21");
      expect(nos.map((b) => b.building_no)).not.toContain("金杨路660弄21号");

      // 断言 2：审核员显式改名同样生效且走归一
      const pending2 = await submitPending(a, {
        kind: "building",
        name: "待改名楼栋",
        parent_kind: "community",
        parent_id: communityId,
      });
      const res2 = await resolve(a, pending2, { action: "create", name: "金杨路660弄22号" });
      expect(res2.ok(), `改名 create 失败: ${res2.status()} ${await res2.text()}`).toBeTruthy();
      const body2 = (await res2.json()) as { resolved_name?: string | null; name_normalized_from?: string | null };
      expect(body2.resolved_name).toBe("金杨路660弄22");
      // 归一前后有差异时才回填 name_normalized_from（前端据此在 toast 里对照）
      expect(body2.name_normalized_from).toBe("金杨路660弄22号");

      const nosAfter = await listBuildingNos(a, communityId);
      expect(nosAfter.map((b) => b.building_no)).toContain("金杨路660弄22");
    } finally {
      await a.dispose();
    }
  });

  test("场景2：无任何可合并目标时默认降级为确认新增（不再推荐 merge）", async () => {
    const a = await api();
    const communityName = `${PREFIX}场景2小区`;
    let communityId: string | null = null;
    try {
      // 新小区：0 条楼栋（实测 2066/21732 个小区属于此类）
      communityId = await createCommunity(a, communityName);
      const nosBefore = await listBuildingNos(a, communityId);
      expect(nosBefore.filter((b) => !b.pending)).toHaveLength(0);

      const pendingId = await submitPending(a, {
        kind: "building",
        name: "1号楼",
        parent_kind: "community",
        parent_id: communityId,
      });

      // 无目标时 merge 本来就该 400/404 —— 证明「推荐 merge」是死路（修复前的运营困境）
      const mergeAttempt = await resolve(a, pendingId, { action: "merge", target_id: "999999999" });
      expect([400, 404]).toContain(mergeAttempt.status());

      // create 必须可用（前端降级后的路径），且落库成功
      const createRes = await resolve(a, pendingId, { action: "create" });
      expect(createRes.ok(), `create 失败: ${createRes.status()} ${await createRes.text()}`).toBeTruthy();
      const nosAfter = await listBuildingNos(a, communityId);
      expect(nosAfter.filter((b) => !b.pending).map((b) => b.building_no)).toContain("1号楼");
    } finally {
      await a.dispose();
    }
  });

  test("场景2b：合并到「待审兄弟」会顺手转正目标（双向状态与引用一致）", async () => {
    const a = await api();
    const communityName = `${PREFIX}场景2b小区`;
    let communityId: string | null = null;
    try {
      communityId = await createCommunity(a, communityName);
      // 两条同小区待审楼栋（模拟重复提交）
      const pendingA = await submitPending(a, {
        kind: "building",
        name: "8号楼",
        parent_kind: "community",
        parent_id: communityId,
      });
      const pendingB = await submitPending(a, {
        kind: "building",
        name: "8号楼-重复提交",
        parent_kind: "community",
        parent_id: communityId,
      });

      // B 选择「用已有的」→ 目标 A（pending 兄弟）
      const res = await resolve(a, pendingB, { action: "merge", target_id: String(pendingA), target_kind: "pending" });
      expect(res.ok(), `合并到待审兄弟失败: ${res.status()} ${await res.text()}`).toBeTruthy();

      // 断言：A 已转正且字典里出现；B 为 merged
      const nos = await listBuildingNos(a, communityId);
      expect(nos.filter((b) => !b.pending).map((b) => b.building_no)).toContain("8号楼");
      expect(nos.filter((b) => !b.pending)).toHaveLength(1);

      const queue = await a.ctx.get("/api/v1/admin/building-dictionary/review?page=1&page_size=100");
      expect(queue.ok()).toBeTruthy();
      const items = ((await queue.json()) as { items: { id: number; status: string }[] }).items;
      expect(items.find((i) => i.id === pendingA)?.status).toBe("created");
      expect(items.find((i) => i.id === pendingB)?.status).toBe("merged");
    } finally {
      await a.dispose();
    }
  });

  test("场景3：楼栋/户室改名（含 uq 409 与 floor 重算）", async () => {
    const a = await api();
    const communityName = `${PREFIX}场景3小区`;
    let communityId: string | null = null;
    try {
      communityId = await createCommunity(a, communityName);
      const res = await a.ctx.post("/api/v1/admin/building-dictionary/buildings", {
        data: { community_id: communityId, building_no: "21" },
      });
      expect(res.ok()).toBeTruthy();
      const blds = await listBuildingNos(a, communityId);
      const buildingId = Number(
        (
          (await (
            await a.ctx.get(
              `/api/v1/admin/building-dictionary/communities/${communityId}/buildings?page=1&page_size=10`,
            )
          ).json()) as { items: { id: number }[] }
        ).items[0].id,
      );
      expect(blds.map((b) => b.building_no)).toContain("21");

      // 3a：改名 21 → 21号（归一为 21，等价改回）—— 验证幂等不报错
      const same = await a.ctx.patch(`/api/v1/admin/building-dictionary/buildings/${buildingId}`, {
        data: { building_no: "21号" },
      });
      expect(same.ok(), `同名归一改名失败: ${same.status()} ${await same.text()}`).toBeTruthy();

      // 3b：改名 21 → 金杨路660弄21（真正改名）
      const rename = await a.ctx.patch(`/api/v1/admin/building-dictionary/buildings/${buildingId}`, {
        data: { building_no: "金杨路660弄21" },
      });
      expect(rename.ok(), `楼栋改名失败: ${rename.status()} ${await rename.text()}`).toBeTruthy();
      const renameBody = (await rename.json()) as { old_name: string; new_name: string };
      expect(renameBody.new_name).toBe("金杨路660弄21");

      // 3c：再建一栋并改名撞名 → 409（不是 500）
      await a.ctx.post("/api/v1/admin/building-dictionary/buildings", {
        data: { community_id: communityId, building_no: "99" },
      });
      const listRes = await a.ctx.get(
        `/api/v1/admin/building-dictionary/communities/${communityId}/buildings?page=1&page_size=10`,
      );
      const all = ((await listRes.json()) as { items: { id: number; building_no: string }[] }).items;
      const b99 = all.find((b) => b.building_no === "99");
      expect(b99).toBeTruthy();
      const clash = await a.ctx.patch(`/api/v1/admin/building-dictionary/buildings/${b99!.id}`, {
        data: { building_no: "金杨路660弄21" },
      });
      expect(clash.status()).toBe(409);

      // 3d：户室改名必须重算楼层（0401 → 0501：4 层 → 5 层）
      const roomCreate = await a.ctx.post(`/api/v1/admin/building-dictionary/buildings/${buildingId}/rooms`, {
        data: { building_id: buildingId, floor: "4", room_suffix: "01" },
      });
      expect(roomCreate.ok()).toBeTruthy();
      const detail = await a.ctx.get(
        `/api/v1/admin/building-dictionary/buildings/${buildingId}?room_page=1&room_page_size=10`,
      );
      const rooms = ((await detail.json()) as { rooms: { id: number; room_no: string; floor: number | null }[] }).rooms;
      const room = rooms.find((r) => r.room_no === "0401");
      expect(room, "户室 0401 未创建").toBeTruthy();
      const roomRename = await a.ctx.patch(
        `/api/v1/admin/building-dictionary/buildings/${buildingId}/rooms/${room!.id}`,
        { data: { room_no: "0501" } },
      );
      expect(roomRename.ok(), `户室改名失败: ${roomRename.status()} ${await roomRename.text()}`).toBeTruthy();
      const detail2 = await a.ctx.get(
        `/api/v1/admin/building-dictionary/buildings/${buildingId}?room_page=1&room_page_size=10`,
      );
      const rooms2 = ((await detail2.json()) as { rooms: { room_no: string; floor: number | null }[] }).rooms;
      const renamed = rooms2.find((r) => r.room_no === "0501");
      expect(renamed, "改名后 0501 不存在").toBeTruthy();
      expect(renamed!.floor, "floor 未随户室号重算").toBe(5);
    } finally {
      await a.dispose();
    }
  });

  test("场景3b：小区改名后旧名仍可搜索（别名沉淀）+ 撞名 409", async () => {
    const a = await api();
    const oldName = `${PREFIX}小区原名`;
    const newName = `${PREFIX}小区新名`;
    const otherName = `${PREFIX}另一小区`;
    try {
      const communityId = await createCommunity(a, oldName);
      await createCommunity(a, otherName);

      const rename = await a.ctx.patch(
        `/api/v1/admin/building-dictionary/communities/${communityId}/rename`,
        { data: { name: newName } },
      );
      expect(rename.ok(), `小区改名失败: ${rename.status()} ${await rename.text()}`).toBeTruthy();

      // 断言 1：详情返回新名
      const detail = await a.ctx.get(`/api/v1/admin/building-dictionary/communities/${communityId}`);
      expect(detail.ok()).toBeTruthy();
      expect(((await detail.json()) as { name: string }).name).toBe(newName);

      // 断言 2：旧名仍可搜索命中（alias_name = 旧名，data_source=rename_operation）
      const searchOld = await a.ctx.get(
        `/api/v1/admin/building-dictionary/communities?keyword=${encodeURIComponent(oldName)}&page=1&page_size=10`,
      );
      expect(searchOld.ok()).toBeTruthy();
      const found = ((await searchOld.json()) as { items: { id: string; name: string }[] }).items;
      expect(found.some((c) => c.id === communityId), "旧名搜索未命中（别名未沉淀）").toBeTruthy();

      // 断言 3：改成别的小区名 → 409
      const clash = await a.ctx.patch(
        `/api/v1/admin/building-dictionary/communities/${communityId}/rename`,
        { data: { name: otherName } },
      );
      expect(clash.status()).toBe(409);
    } finally {
      await a.dispose();
    }
  });

  test("场景3c（接线验证）：改名后项目详情 building_no 读回新名", async () => {
    const a = await api();
    const communityName = `${PREFIX}接线小区`;
    try {
      const communityId = await createCommunity(a, communityName);
      const roomRes = await a.ctx.post("/api/v1/admin/building-dictionary/buildings", {
        data: { community_id: communityId, building_no: "7" },
      });
      expect(roomRes.ok()).toBeTruthy();
      const listRes = await a.ctx.get(
        `/api/v1/admin/building-dictionary/communities/${communityId}/buildings?page=1&page_size=10`,
      );
      const buildingId = ((await listRes.json()) as { items: { id: number }[] }).items[0].id;

      // 造一条绑定该楼栋的项目（dict_status=linked），用于验证消费方
      const proj = await a.ctx.post("/api/v1/projects", {
        data: {
          community_id: communityId,
          community_name: communityName,
          address: `${communityName} 7号`,
          building_id: buildingId,
          dict_status: "linked",
          signing_price: 100,
          // contract_no / signing_period 为创建必填，缺任一即 422
          contract_no: `${PREFIX}HT${Date.now() % 100000}`,
          signing_period: 30,
        },
      });
      if (!proj.ok()) {
        // 项目创建依赖较重：若环境缺必填项则显式跳过并报未覆盖（不静默通过）
        test.skip(true, `项目创建不可用（HTTP ${proj.status()}），接线验证未覆盖`);
        return;
      }
      const projectId = ((await proj.json()) as { id: string }).id;

      const rename = await a.ctx.patch(`/api/v1/admin/building-dictionary/buildings/${buildingId}`, {
        data: { building_no: "金杨路660弄7" },
      });
      expect(rename.ok()).toBeTruthy();

      // 消费方读回：项目详情的 building_no 由 resolve_doc_names 实时查实表
      const detail = await a.ctx.get(`/api/v1/projects/${projectId}`);
      expect(detail.ok(), `项目详情读取失败: ${detail.status()}`).toBeTruthy();
      const body = (await detail.json()) as { building_no?: string | null };
      expect(body.building_no, "改名后项目详情 building_no 未更新（消费方未生效）").toBe("金杨路660弄7");
    } finally {
      await a.dispose();
    }
  });
});
