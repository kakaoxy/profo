/**
 * 「估价提交」页 × 楼盘字典接线回归.
 *
 * 背景（2026-10-26）：估价提交页原为自由文本小区名（SRS FR-17 v1.5 口径）。
 * 本次要求与 `admin/leads` 新增线索完全一致：小区走字典选择器（必选）、
 * 楼栋/户室选填、搜不到时随线索提交进审核池。
 *
 * 本测试锁死三件容易回归的事：
 * 1. 页面向后端发送的字典字段名与语义（building_id/room_id + new_* 载荷）；
 * 2. dict_status **不由前端自报**（后端按「有 building/room → linked / 有 new_* →
 *    pending / 其余 manual」推导，前端多传会与后端推导打架）；
 * 3. 选到字典小区后旧小区残留的行政区/商圈必须被清空（否则会随单提交脏数据）。
 *
 * 2026-10-30 口径调整：内部员工（admin 令牌）走字典选择器，外部用户保持手工填写；
 * 文件末尾新增员工态/外部用户态用例锁定该差异。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs } from "../test-harness";
import { hasValidAdminToken } from "../../utils/token";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/token", () => ({
  getAccessToken: vi.fn(() => "admin-tok"),
  getCAccessToken: vi.fn(() => "c-tok"),
  getUserIdFromAccessToken: vi.fn(() => ""),
  hasValidAdminToken: vi.fn(() => false),
}));
vi.mock("../../utils/url", () => ({
  resolveAssetUrl: vi.fn((u: string) => u || ""),
}));
vi.mock("../../utils/format", () => ({
  formatThousands: vi.fn((n: number) => String(n)),
}));
vi.mock("../../utils/visitor", () => ({
  getVisitorId: vi.fn(() => "v1"),
}));
vi.mock("../../utils/valuation-share", () => ({
  buildValuationSharePath: vi.fn(() => "/pages/valuation/submit/index"),
  fetchEmployeeId: vi.fn(async () => ""),
  parseValuationQuery: vi.fn(() => ({ referrer: "" })),
  VALUATION_SHARE_IMAGE: "",
  VALUATION_SHARE_TITLE: "",
}));
vi.mock("../../utils/valuation-notify", () => ({
  fetchValuationSubscribeTemplate: vi.fn(async () => null),
  requestValuationPriceSubscribe: vi.fn((_id: string, cb: () => void) => cb()),
}));

beforeAll(async () => {
  await import("../../pages/valuation/submit/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** 填好除小区外的必填项（楼层/总高），使提交守卫只卡在小区的字典字段上 */
function fillRequired(ctx: AnyRecord, patch: AnyRecord = {}): void {
  ctx.setData({
    "form.floor": "5",
    "form.total_floor": "18",
    "form.layout": "2室1厅",
    "form.area": "88",
    ...patch,
  });
}

/** 取最近一次 POST /public/leads 的请求体 */
function submitBody(): AnyRecord {
  const req = pendingReqs().filter((r) => r.opts.url === "/public/leads").pop();
  if (!req) {
    throw new Error("POST /public/leads not found");
  }
  return req.opts.data as AnyRecord;
}

beforeEach(() => {
  resetTestStubs();
});

describe("楼盘字典接线", () => {
  it("选中字典小区/楼栋/户室 → 表单回填 id，提交体带 building_id/room_id 且不自报 dict_status", async () => {
    const ctx = createPageHarness({});
    fillRequired(ctx);
    ctx.onDictChange({
      detail: {
        communityId: "c-1",
        communityName: "梅花新村（花木）",
        district: "浦东新区",
        businessCircle: "花木",
        buildingId: 292014,
        buildingNo: "01",
        roomId: 4262551,
        roomNo: "0101",
        dictStatus: "linked",
        newCommunity: null,
        newBuilding: null,
        newRoom: null,
      },
    });

    expect(ctx.data.form.community_name).toBe("梅花新村（花木）");
    expect(ctx.data.form.community_id).toBe("c-1");
    expect(ctx.data.form.district).toBe("浦东新区");
    expect(ctx.data.form.business_area).toBe("花木");
    expect(ctx.data.form.building_id).toBe(292014);
    expect(ctx.data.form.room_id).toBe(4262551);

    ctx.onSubmit();
    const body = submitBody();
    expect(body.community_id).toBe("c-1");
    expect(body.building_id).toBe(292014);
    expect(body.room_id).toBe(4262551);
    // dict_status 由后端 Service 推导，前端一律不传（否则与后端推导打架）
    expect(body.dict_status).toBeUndefined();
    // 未新增条目时不带 new_* 载荷
    expect(body.new_community).toBeUndefined();
    expect(body.new_building).toBeUndefined();
    expect(body.new_room).toBeUndefined();
  });

  it("搜不到小区（pending）：透传 new_community，且不传字典 id", async () => {
    const ctx = createPageHarness({});
    fillRequired(ctx);
    ctx.onDictChange({
      detail: {
        communityId: "",
        communityName: "阳光花园（自填）",
        district: "",
        businessCircle: "",
        buildingId: null,
        buildingNo: "",
        roomId: null,
        roomNo: "",
        dictStatus: "pending",
        newCommunity: { name: "阳光花园（自填）" },
        newBuilding: null,
        newRoom: null,
      },
    });

    ctx.onSubmit();
    const body = submitBody();
    expect(body.community_name).toBe("阳光花园（自填）");
    expect(body.community_id).toBeUndefined();
    expect(body.new_community).toEqual({ name: "阳光花园（自填）" });
    expect(body.dict_status).toBeUndefined();
  });

  it("已有小区下新建楼栋/户室：new_building/new_room 一并透传（父级由后端解析）", async () => {
    const ctx = createPageHarness({});
    fillRequired(ctx);
    ctx.onDictChange({
      detail: {
        communityId: "c-1",
        communityName: "梅花新村",
        district: "浦东新区",
        businessCircle: "花木",
        buildingId: null,
        buildingNo: "99",
        roomId: null,
        roomNo: "0403",
        dictStatus: "pending",
        newCommunity: null,
        newBuilding: { name: "99" },
        newRoom: { name: "0403" },
      },
    });

    ctx.onSubmit();
    const body = submitBody();
    expect(body.community_id).toBe("c-1");
    expect(body.building_id).toBeUndefined();
    expect(body.room_id).toBeUndefined();
    expect(body.new_building).toEqual({ name: "99" });
    expect(body.new_room).toEqual({ name: "0403" });
  });

  it("切换小区后清空旧行政区/商圈：不留脏值", async () => {
    const ctx = createPageHarness({});
    const base = {
      buildingId: null,
      buildingNo: "",
      roomId: null,
      roomNo: "",
      newCommunity: null,
      newBuilding: null,
      newRoom: null,
    };
    ctx.onDictChange({
      detail: {
        ...base,
        communityId: "c-1",
        communityName: "A 小区",
        district: "浦东新区",
        businessCircle: "花木",
        dictStatus: "linked",
      },
    });
    expect(ctx.data.form.district).toBe("浦东新区");

    // 切到搜不到的待审小区：没有行政区/商圈，必须清空而不是沿用上一家
    ctx.onDictChange({
      detail: {
        ...base,
        communityId: "",
        communityName: "B 小区（自填）",
        district: "",
        businessCircle: "",
        dictStatus: "pending",
        newCommunity: { name: "B 小区（自填）" },
      },
    });
    expect(ctx.data.form.district).toBe("");
    expect(ctx.data.form.business_area).toBe("");
    expect(ctx.data.form.community_id).toBe("");
  });

  it("未选小区时提交被拦截", async () => {
    const ctx = createPageHarness({});
    fillRequired(ctx);
    ctx.onSubmit();
    expect(pendingReqs().some((r) => r.opts.url === "/public/leads")).toBe(false);
  });
});

describe("员工态 / 外部用户态小区输入", () => {
  it("内部员工（admin 令牌）进入页面即按员工态渲染字典选择器，无需等 /auth/me 返回", () => {
    vi.mocked(hasValidAdminToken).mockReturnValue(true);
    const ctx = createPageHarness({});
    ctx.onLoad({});

    expect(ctx.data.isEmployee).toBe(true);
  });

  it("外部用户进入页面为手填态，输入小区名只写 community_name 并清空字典残留字段", () => {
    vi.mocked(hasValidAdminToken).mockReturnValue(false);
    const ctx = createPageHarness({});
    ctx.onLoad({});
    ctx.setData({
      "form.community_id": "c-old",
      "form.district": "浦东新区",
      "form.business_area": "花木",
      "form.building_id": 292014,
      "form.room_id": 4262551,
    });

    ctx.onCommunityInput({ detail: { value: "输入的新小区" } });

    expect(ctx.data.isEmployee).toBe(false);
    expect(ctx.data.form.community_name).toBe("输入的新小区");
    expect(ctx.data.form.community_id).toBe("");
    expect(ctx.data.form.district).toBe("");
    expect(ctx.data.form.business_area).toBe("");
    expect(ctx.data.form.building_id).toBeNull();
    expect(ctx.data.form.room_id).toBeNull();
  });

  it("员工态切回外部用户态（admin 令牌失效）时清空字典残留字段，小区名保留供手填框回显", () => {
    vi.mocked(hasValidAdminToken).mockReturnValue(true);
    const ctx = createPageHarness({});
    ctx.onLoad({});
    // 员工态下通过字典选择器选了小区/楼栋/户室
    ctx.onDictChange({
      detail: {
        communityId: "c-1",
        communityName: "梅花新村（花木）",
        district: "浦东新区",
        businessCircle: "花木",
        buildingId: 292014,
        buildingNo: "01",
        roomId: 4262551,
        roomNo: "0101",
        dictStatus: "linked",
        newCommunity: null,
        newBuilding: null,
        newRoom: null,
      },
    });
    expect(ctx.data.form.building_id).toBe(292014);

    // admin 令牌失效（登出/过期）→ onShow 切回外部用户手填态
    vi.mocked(hasValidAdminToken).mockReturnValue(false);
    ctx.onShow();

    expect(ctx.data.isEmployee).toBe(false);
    expect(ctx.data.form.community_name).toBe("梅花新村（花木）");
    expect(ctx.data.form.community_id).toBe("");
    expect(ctx.data.form.district).toBe("");
    expect(ctx.data.form.business_area).toBe("");
    expect(ctx.data.form.building_id).toBeNull();
    expect(ctx.data.form.room_id).toBeNull();
  });
});

describe("提交成功后跳转与守卫（回归：与字典改造无关但共用同一路径）", () => {
  it("成功后置 navigating，跳转延迟窗口内重复提交被守卫拦截", async () => {
    const ctx = createPageHarness({});
    fillRequired(ctx);
    ctx.onDictChange({
      detail: {
        communityId: "c-1",
        communityName: "梅花新村",
        district: "",
        businessCircle: "",
        buildingId: null,
        buildingNo: "",
        roomId: null,
        roomNo: "",
        dictStatus: "linked",
        newCommunity: null,
        newBuilding: null,
        newRoom: null,
      },
    });
    ctx.onSubmit();
    const reqs = pendingReqs().filter((r) => r.opts.url === "/public/leads");
    expect(reqs).toHaveLength(1);
    reqs[0].resolve({ id: "lead-1" });
    await flush();
    expect(ctx.data.navigating).toBe(true);

    // 跳转延迟窗口内再次触发：navigating 守卫必须拦住，不再发第二次 POST
    ctx.onSubmit();
    expect(pendingReqs().filter((r) => r.opts.url === "/public/leads")).toHaveLength(1);

    // afterSubmitSuccess 在无历史栈时走 redirectTo 落地列表页
    // （小程序运行时全局 getCurrentPages 在 vitest 环境不存在，按空栈桩）
    (globalThis as unknown as { getCurrentPages: () => unknown[] }).getCurrentPages = () => [];
    ctx.afterSubmitSuccess();
    const wx = (globalThis as unknown as { wx: AnyRecord }).wx;
    expect(wx.redirectTo).toHaveBeenCalledWith(
      expect.objectContaining({ url: "/pages/valuation/list/index" }),
    );
  });
});
