/**
 * 「楼盘字典四级地址选择器」（小程序 C 端）组件单测.
 *
 * 需求（2026-10-26）：估价提交页的小区选择改为与 `admin/leads` 完全一致的字典口径。
 * 本测试锁死组件对外载荷（`change` 事件的 detail）的三条不变式：
 * 1. **字典命中**：选小区/楼栋/户室 → 对应 id 回填，`new_*` 全部为 null；
 * 2. **待审载荷**：搜不到小区 / 新建楼栋 / 新建户室 → 只带名称，id 为空；
 *    且「新建」与「选回字典」互斥（不能同时提交实表 id 与 new_*，否则后端
 *    dict_status 推导会打架）；
 * 3. **待审条目不可选**：pending 楼栋/户室点选只 toast，不改变载荷。
 *
 * 组件用 `Component()` 注册，与页面 harness 不同，这里用简易注册桩捕获配置。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wxStubs } from "../test-harness";

type AnyRecord = Record<string, any>;

/** 捕获 Component(config) 的注册桩（组件与页面的注册 API 不同） */
let componentConfig: AnyRecord | null = null;
(globalThis as unknown as { Component: (cfg: unknown) => void }).Component = (cfg) => {
  componentConfig = cfg as AnyRecord;
};

/** 受控请求队列（组件内部会发小区搜索/楼栋/户室请求） */
const pending: { opts: AnyRecord; resolve: (v: unknown) => void; reject: (e?: unknown) => void }[] = [];

vi.mock("../../utils/request", () => ({
  request: vi.fn(
    (opts: AnyRecord) =>
      new Promise((resolve, reject) => {
        pending.push({ opts, resolve, reject });
      })
  ),
}));

beforeAll(async () => {
  await import("../../components/dict-address-picker/index");
});

type AnyEvt = { detail?: AnyRecord; currentTarget?: { dataset: AnyRecord } };

/** 以组件配置构造实例（data 深拷贝 + setData 顶层合并 + 方法绑定 this） */
function createComponent() {
  if (!componentConfig) {
    throw new Error("Component 配置未加载");
  }
  const state: AnyRecord = JSON.parse(JSON.stringify(componentConfig.data));
  /** 最近一次 triggerEvent 的载荷 */
  const events: { name: string; detail: AnyRecord }[] = [];
  const inst: AnyRecord = {
    data: state,
    searchTimer: null,
    searchSeq: 0,
    buildingSearchTimer: null,
    buildingSearchSeq: 0,
    setData(patch: AnyRecord) {
      Object.assign(state, patch);
    },
    triggerEvent(name: string, detail: AnyRecord) {
      events.push({ name, detail });
    },
  };
  for (const [name, fn] of Object.entries(componentConfig.methods as AnyRecord)) {
    inst[name] = (fn as (...args: unknown[]) => unknown).bind(inst);
  }
  inst.__events = events;
  return inst;
}

/** 取最近一次 change 事件载荷（组件对外唯一出口） */
function lastPayload(inst: AnyRecord): AnyRecord {
  const evts = (inst.__events as { name: string; detail: AnyRecord }[]).filter(
    (e) => e.name === "change"
  );
  if (!evts.length) {
    throw new Error("未触发 change 事件");
  }
  return evts[evts.length - 1].detail;
}

beforeEach(() => {
  pending.length = 0;
  for (const stub of Object.values(wxStubs)) {
    (stub as AnyRecord).mockClear();
  }
});

describe("字典命中：id 回填，new_* 全空", () => {
  it("选小区 → 回填 id/行政区/商圈，loadBuildings 发出只读请求", () => {
    const comp = createComponent();
    comp.onCommunityPick({
      currentTarget: {
        dataset: { id: "c-1", name: "梅花新村", district: "浦东新区", business: "花木" },
      },
    });
    const payload = lastPayload(comp);
    expect(payload.communityId).toBe("c-1");
    expect(payload.communityName).toBe("梅花新村");
    expect(payload.district).toBe("浦东新区");
    expect(payload.businessCircle).toBe("花木");
    expect(payload.dictStatus).toBe("linked");
    expect(payload.newCommunity).toBeNull();
    expect(payload.newBuilding).toBeNull();
    expect(payload.newRoom).toBeNull();
    // 楼栋列表使用免登录只读端点（C 端令牌体系下不得调 admin 字典端点）
    expect(pending[0].opts.url).toBe("/public/building-dictionary/communities/c-1/buildings");
    expect(pending[0].opts.skipAuth).toBe(true);
  });

  it("选楼栋 → 清空待审载荷并拉取户室；选户室 → room_id 回填", async () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    pending[0].resolve({ total: 1, items: [{ id: 11, building_no: "8", pending: false, pending_id: null }] });
    await new Promise((r) => setTimeout(r, 0));
    // 楼栋展示量词在 TS 侧格式化（裸号补「号」，自带量词原样）
    expect((comp.data.buildings[0] as AnyRecord).label).toBe("8号");

    comp.onBuildingPick({ currentTarget: { dataset: { id: 11, no: "8", pending: false } } });
    expect((comp.data as AnyRecord).buildingLabel).toBe("8号");
    let payload = lastPayload(comp);
    expect(payload.buildingId).toBe(11);
    expect(payload.buildingNo).toBe("8");
    expect(payload.newBuilding).toBeNull();
    const roomReq = pending.find((p) => p.opts.url === "/public/building-dictionary/buildings/11");
    expect(roomReq, "应发出户室请求").toBeTruthy();
    roomReq!.resolve({
      id: 11,
      rooms: [{ id: 101, room_no: "0401", floor: 4, plate_no: "401", pending: false }],
      room_has_more: false,
    });
    await new Promise((r) => setTimeout(r, 0));

    comp.onRoomPick({ currentTarget: { dataset: { id: 101, no: "0401", pending: false } } });
    payload = lastPayload(comp);
    expect(payload.roomId).toBe(101);
    expect(payload.roomNo).toBe("0401");
    expect(payload.newRoom).toBeNull();
    expect(payload.dictStatus).toBe("linked");
  });
});

describe("待审载荷：只带名称，且与字典选择互斥", () => {
  it("搜不到小区 → new_community 携带名称，communityId 为空", () => {
    const comp = createComponent();
    comp.setData({ communityKeyword: "阳光花园（自填）" });
    comp.onCommunityUseQuery();
    const payload = lastPayload(comp);
    expect(payload.communityName).toBe("阳光花园（自填）");
    expect(payload.communityId).toBe("");
    expect(payload.dictStatus).toBe("pending");
    expect(payload.newCommunity).toEqual({ name: "阳光花园（自填）" });
  });

  it("新建楼栋 → new_building 携带名称；随后选回字典楼栋 → new_building 作废", () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    comp.setData({ buildingDraft: "99" });
    comp.onCreateBuilding();
    let payload = lastPayload(comp);
    expect(payload.buildingNo).toBe("99");
    expect(payload.buildingId).toBeNull();
    expect(payload.newBuilding).toEqual({ name: "99" });
    expect(payload.dictStatus).toBe("pending");

    // 改选字典楼栋：不能同时带 building_id 和 new_building
    comp.onBuildingPick({ currentTarget: { dataset: { id: 11, no: "8" } } });
    payload = lastPayload(comp);
    expect(payload.buildingId).toBe(11);
    expect(payload.newBuilding).toBeNull();
    expect(payload.dictStatus).toBe("linked");
  });

  it("新建户室 → new_room 携带名称；校验户室号楼层位", () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    comp.onBuildingPick({ currentTarget: { dataset: { id: 11, no: "8" } } });

    // 非法户室号（楼层位为 0）→ 拦截，不发 change
    comp.setData({ roomDraft: "0001" });
    const before = (comp.__events as unknown[]).length;
    comp.onCreateRoom();
    expect((comp.__events as unknown[]).length).toBe(before);
    expect(wxStubs.showToast).toHaveBeenCalled();

    comp.setData({ roomDraft: "0403" });
    comp.onCreateRoom();
    const payload = lastPayload(comp);
    expect(payload.roomNo).toBe("0403");
    expect(payload.roomId).toBeNull();
    expect(payload.newRoom).toEqual({ name: "0403" });
  });

  it("新建楼栋与已有楼栋重名 → 拦截（不得产生重复 pending）", () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    comp.setData({
      buildings: [{ id: 11, building_no: "8", pending: false, pending_id: null }],
      // 服务端搜索模式下 buildings 即当前结果集；同名 pending 由后端 uq_pending_open 兜底
      visibleBuildings: [],
      buildingDraft: "8",
    });
    const before = (comp.__events as unknown[]).length;
    comp.onCreateBuilding();
    expect((comp.__events as unknown[]).length).toBe(before);
    expect(wxStubs.showToast).toHaveBeenCalled();
  });
});

describe("待审条目不可选（BR-23：仅来源单据可回显）", () => {
  it("pending 楼栋 → toast 且载荷不变", () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    const before = JSON.stringify(lastPayload(comp));
    comp.onBuildingPick({ currentTarget: { dataset: { id: 0, no: "88", pending: true } } });
    expect(JSON.stringify(lastPayload(comp))).toBe(before);
    expect(wxStubs.showToast).toHaveBeenCalled();
  });

  it("pending 户室 → toast 且载荷不变", () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    comp.onBuildingPick({ currentTarget: { dataset: { id: 11, no: "8" } } });
    const before = JSON.stringify(lastPayload(comp));
    comp.onRoomPick({ currentTarget: { dataset: { id: 0, no: "0403", pending: true } } });
    expect(JSON.stringify(lastPayload(comp))).toBe(before);
    expect(wxStubs.showToast).toHaveBeenCalled();
  });
});

describe("楼栋搜索与楼层筛选", () => {
  it("楼栋搜索走服务端 keyword（可命中首屏 100 条之外的楼栋）", async () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-huma", name: "呼玛二村" } } });
    pending[0].resolve({ total: 279, items: [] });
    await new Promise((r) => setTimeout(r, 0));

    comp.onBuildingSearch({ detail: { value: "285" } });
    // 300ms 防抖期内不发请求
    expect(pending).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 400));
    expect(pending).toHaveLength(2);
    expect(pending[1].opts.url).toBe("/public/building-dictionary/communities/c-huma/buildings");
    expect(pending[1].opts.data.keyword).toBe("285");
    pending[1].resolve({
      total: 1,
      items: [{ id: 2851, building_no: "285", pending: false, pending_id: null }],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(comp.data.visibleBuildings.map((b: AnyRecord) => b.building_no)).toEqual(["285"]);
    expect((comp.data.visibleBuildings[0] as AnyRecord).label).toBe("285号");
  });

  it("清空楼栋关键词 → 立即回全量第一页（不带 keyword）", async () => {
    const comp = createComponent();
    comp.onCommunityPick({ currentTarget: { dataset: { id: "c-1", name: "A 小区" } } });
    pending[0].resolve({ total: 2, items: [] });
    await new Promise((r) => setTimeout(r, 0));

    comp.onBuildingSearch({ detail: { value: "12" } });
    await new Promise((r) => setTimeout(r, 400));
    expect(pending[1].opts.data.keyword).toBe("12");
    pending[1].resolve({ total: 0, items: [] });
    await new Promise((r) => setTimeout(r, 0));

    comp.onBuildingSearch({ detail: { value: "" } });
    // 空关键词立即请求，不防抖
    expect(pending).toHaveLength(3);
    expect(pending[2].opts.data.keyword).toBeUndefined();
    pending[2].resolve({
      total: 2,
      items: [
        { id: 1, building_no: "1", pending: false, pending_id: null },
        { id: 2, building_no: "12", pending: false, pending_id: null },
      ],
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(comp.data.visibleBuildings).toHaveLength(2);
  });

  it("手动添加默认收起；弱化入口/空态可展开并预填搜索词", async () => {
    const comp = createComponent();
    expect(comp.data.buildingManualOpen).toBe(false);
    comp.onToggleBuildingManual({ currentTarget: { dataset: { prefill: "285" } } });
    expect(comp.data.buildingManualOpen).toBe(true);
    expect(comp.data.buildingDraft).toBe("285");
    // 手填面板打开时不再渲染弱化入口（WXML wx:if 互斥，这里锁 data 语义）
    comp.onNewBuildingInput({ detail: { value: "" } });
    comp.onCreateBuilding();
    // 空草稿不产生事件
    expect(comp.__events.filter((e: AnyRecord) => e.name === "change")).toHaveLength(0);
  });

  it("楼层筛选：全部 / 指定层", () => {
    const comp = createComponent();
    comp.setData({
      rooms: [
        { id: 1, room_no: "0101", floor: 1, plate_no: "101", pending: false },
        { id: 2, room_no: "0401", floor: 4, plate_no: "401", pending: false },
      ],
      visibleRooms: [
        { id: 1, room_no: "0101", floor: 1, plate_no: "101", pending: false },
        { id: 2, room_no: "0401", floor: 4, plate_no: "401", pending: false },
      ],
    });
    comp.onFloorPick({ currentTarget: { dataset: { floor: "4" } } });
    expect(comp.data.visibleRooms.map((r: AnyRecord) => r.room_no)).toEqual(["0401"]);
    comp.onFloorPick({ currentTarget: { dataset: { floor: "all" } } });
    expect(comp.data.visibleRooms).toHaveLength(2);
  });
});
