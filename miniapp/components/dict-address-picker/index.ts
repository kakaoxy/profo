/**
 * 楼盘字典四级地址选择器（小程序 C 端）.
 *
 * 业务口径与 `admin/leads` 新增线索完全一致：小区必选、楼栋/户室选填，
 * 搜不到时可填新名称，随线索提交一并进字典审核池（不阻塞提交）。
 *
 * 与 admin 端 `dict-address-picker` 的唯一刻意差异：**C 端不直接调用 pending 提交接口**。
 * 新增小区/楼栋/户室在这里只落为 `newCommunity/newBuilding/newRoom` 载荷，
 * 由后端 `LeadService.create_lead` 在创建线索的同一事务里走 `submit_dict_chain`
 * 写入审核池——C 端若自己先提交 pending，用户放弃提交时会留下没有来源单据的
 * 孤儿待审条目，且会绕开「单据 + pending 同事务」的一致性保证。
 *
 * 读接口（全部免登录、只读）：
 * - GET /public/communities/search            小区搜索（名称/地址/别名）
 * - GET /public/building-dictionary/communities/{id}/buildings  楼栋列表（含待审标记）
 * - GET /public/building-dictionary/buildings/{id}              户室分页（含楼层字段）
 *
 * 事件：
 * - `change`：detail = DictAddressValue（父级写表单的唯一入口）
 */
import type { components } from "../../types/api-types";
import { formatBuildingLabel } from "../../utils/building-label";
import { request } from "../../utils/request";

type PublicCommunitySearchItem = components["schemas"]["PublicCommunitySearchItem"];
type BdBuildingListResponse = components["schemas"]["BdBuildingListResponse"];
type BdBuildingDetail = components["schemas"]["BdBuildingDetail"];

/** 输入防抖间隔（ms） */
const DEBOUNCE_DELAY = 300;
/** 小区候选条数上限（对齐后端 limit 参数） */
const COMMUNITY_SEARCH_LIMIT = 20;
/** 楼栋单页条数（大社区只拉当页，避免一次性渲染上千楼栋） */
const BUILDING_PAGE_SIZE = 100;
/** 户室单页条数（后端上限 500） */
const ROOM_PAGE_SIZE = 500;
/** 户室分页安全上限（实测最大楼栋 928 户） */
const ROOM_MAX_PAGES = 10;

/** 组件对外回传的字典地址值（字段语义与 admin DictAddressValue 对齐） */
interface DictAddressValue {
  communityId: string;
  communityName: string;
  district: string;
  businessCircle: string;
  buildingId: number | null;
  buildingNo: string;
  roomId: number | null;
  roomNo: string;
  /** linked=字典数据 / pending=提交了新增待审 / manual=自由文本（C 端不再单独使用） */
  dictStatus: "linked" | "pending";
  newCommunity: { name: string; district?: string | null; business_circle?: string | null } | null;
  newBuilding: { name: string } | null;
  newRoom: { name: string } | null;
}

/** 楼栋候选项（pending=审核池条目，无实表 id，C 端置灰不可选） */
interface BuildingOption {
  id: number;
  building_no: string;
  /** 展示文案：已带量词原样，否则补「号」 */
  label: string;
  pending: boolean;
  pending_id: number | null;
  /** wxml wx:key（pending 楼栋 id 恒为 0，不能用 id，否则多条待审时 key 重复） */
  key: string;
}

/** 户室候选项 */
interface RoomOption {
  id: number;
  room_no: string;
  floor: number | null;
  plate_no: string;
  pending: boolean;
  /** wxml wx:key（同上：pending 户室 id 恒为 0） */
  key: string;
}

/** 楼层分组（展示层聚合，非独立实体） */
interface FloorOption {
  /** 选项 key（"all" / 楼层数字串 / ""=未分层），与 activeFloor 直接可比 */
  key: string;
  floor: number | null;
  label: string;
  count: number;
}

type ComponentData = {
  // 一级：小区
  communityKeyword: string;
  communityResults: PublicCommunitySearchItem[];
  communitySearching: boolean;
  communityDropdown: boolean;
  communityId: string;
  communityName: string;
  district: string;
  businessCircle: string;
  // 二级：楼栋
  buildings: BuildingOption[];
  /** 按楼栋号关键词过滤后的可见楼栋（过滤在 JS 侧做：wxml 同一节点上 wx:for + wx:if 时 wx:if 优先，item 取不到） */
  visibleBuildings: BuildingOption[];
  buildingsLoading: boolean;
  buildingKeyword: string;
  buildingId: number | null;
  buildingNo: string;
  /** 已选楼栋展示文案（WXML 不能写正则，统一在 TS 侧格式化） */
  buildingLabel: string;
  // 三/四级：楼层 + 户室
  floors: FloorOption[];
  activeFloor: string;
  rooms: RoomOption[];
  visibleRooms: RoomOption[];
  roomsLoading: boolean;
  roomId: number | null;
  roomNo: string;
  // 状态
  dictStatus: "linked" | "pending";
  /** 已确认提交的新增名称（emit 用的真值；输入框草稿在下方 Draft 字段） */
  newCommunityName: string;
  newBuildingName: string;
  newRoomName: string;
  /** 输入框草稿（点「添加」后才写入上面三个已确认字段） */
  buildingDraft: string;
  roomDraft: string;
  /** 「手动添加楼栋」弱化入口展开态（默认收起，避免压过搜索） */
  buildingManualOpen: boolean;
};

interface ComponentCustomProperties {
  searchTimer: number | null;
  searchSeq: number;
  buildingSearchTimer: number | null;
  buildingSearchSeq: number;
}

interface Methods {
  [key: string]: Function;
  onCommunityInput(e: WechatMiniprogram.Input): void;
  onCommunityPick(e: WechatMiniprogram.BaseEvent): void;
  onCommunityClear(): void;
  onCommunityUseQuery(): void;
  onBuildingSearch(e: WechatMiniprogram.Input): void;
  onBuildingPick(e: WechatMiniprogram.BaseEvent): void;
  onNewBuildingInput(e: WechatMiniprogram.Input): void;
  /** 展开「手动添加楼栋」弱化入口（可携带搜索词预填） */
  onToggleBuildingManual(e: WechatMiniprogram.BaseEvent): void;
  onCreateBuilding(): void;
  onNewRoomInput(e: WechatMiniprogram.Input): void;
  /** 楼栋号服务端搜索（keyword 透传 /public 字典接口，突破首屏 100 条限制） */
  searchBuildings(keyword: string, seq: number): void;
  onFloorPick(e: WechatMiniprogram.BaseEvent): void;
  onRoomPick(e: WechatMiniprogram.BaseEvent): void;
  onCreateRoom(): void;
  clearTimer(): void;
  clearBuildingTimer(): void;
  doSearch(keyword: string, seq: number): void;
  loadBuildings(communityId: string): void;
  loadRooms(buildingId: number): void;
  emit(): void;
  /** 户室号解析楼层（与后端 parse_room_floor 对齐：0401→4、202→2） */
  floorOfRoom(roomNo: string): number | null;
}

const data: ComponentData = {
  communityKeyword: "",
  communityResults: [],
  communitySearching: false,
  communityDropdown: false,
  communityId: "",
  communityName: "",
  district: "",
  businessCircle: "",
  buildings: [],
  visibleBuildings: [],
  buildingsLoading: false,
  buildingKeyword: "",
  buildingId: null,
  buildingNo: "",
  buildingLabel: "",
  floors: [],
  activeFloor: "all",
  rooms: [],
  visibleRooms: [],
  roomsLoading: false,
  roomId: null,
  roomNo: "",
  dictStatus: "linked",
  newCommunityName: "",
  newBuildingName: "",
  newRoomName: "",
  buildingDraft: "",
  roomDraft: "",
  buildingManualOpen: false,
};

Component<ComponentData, Record<string, never>, Methods, [], ComponentCustomProperties>({
  data,
  lifetimes: {
    attached() {
      this.searchTimer = null;
      this.searchSeq = 0;
      this.buildingSearchTimer = null;
      this.buildingSearchSeq = 0;
    },
    detached() {
      this.clearTimer();
      this.clearBuildingTimer();
    },
  },
  methods: {
    onCommunityInput(e: WechatMiniprogram.Input) {
      const raw = e.detail.value || "";
      const keyword = raw.trim();
      this.setData({ communityKeyword: raw });
      this.clearTimer();
      if (!keyword) {
        this.setData({
          communityResults: [],
          communitySearching: false,
          communityDropdown: false,
        });
        return;
      }
      this.setData({ communitySearching: true, communityDropdown: true });
      this.searchSeq += 1;
      const seq = this.searchSeq;
      this.searchTimer = setTimeout(() => {
        this.searchTimer = null;
        this.doSearch(keyword, seq);
      }, DEBOUNCE_DELAY);
    },

    doSearch(keyword: string, seq: number) {
      request<PublicCommunitySearchItem[]>({
        url: "/public/communities/search",
        data: { q: keyword, limit: COMMUNITY_SEARCH_LIMIT },
        skipAuth: true,
      })
        .then((list) => {
          if (seq !== this.searchSeq) {
            return;
          }
          this.setData({ communityResults: list || [], communitySearching: false });
        })
        .catch(() => {
          if (seq !== this.searchSeq) {
            return;
          }
          this.setData({ communityResults: [], communitySearching: false });
          wx.showToast({ title: "搜索失败，请稍后重试", icon: "none" });
        });
    },

    /** 选中字典小区：回填行政区/商圈，重置下游级联并加载楼栋 */
    onCommunityPick(e: WechatMiniprogram.BaseEvent) {
      const ds = e.currentTarget.dataset;
      const id = (ds.id as string) || "";
      const name = (ds.name as string) || "";
      if (!id) {
        return;
      }
      this.setData({
        communityId: id,
        communityName: name,
        communityKeyword: name,
        district: (ds.district as string) || "",
        businessCircle: (ds.business as string) || "",
        communityDropdown: false,
        communityResults: [],
        buildingId: null,
        buildingNo: "",
        buildingLabel: "",
        buildings: [],
        visibleBuildings: [],
        buildingKeyword: "",
        floors: [],
        activeFloor: "all",
        rooms: [],
        visibleRooms: [],
        roomId: null,
        roomNo: "",
        dictStatus: "linked",
        newCommunityName: "",
        newBuildingName: "",
        newRoomName: "",
        buildingDraft: "",
        roomDraft: "",
        buildingManualOpen: false,
      });
      this.loadBuildings(id);
      this.emit();
    },

    onCommunityClear() {
      this.clearTimer();
      this.setData({
        communityKeyword: "",
        communityResults: [],
        communitySearching: false,
        communityDropdown: false,
        communityId: "",
        communityName: "",
        district: "",
        businessCircle: "",
        buildings: [],
        visibleBuildings: [],
        buildingId: null,
        buildingNo: "",
        buildingKeyword: "",
        floors: [],
        activeFloor: "all",
        rooms: [],
        visibleRooms: [],
        roomId: null,
        roomNo: "",
        dictStatus: "linked",
        newCommunityName: "",
        newBuildingName: "",
        newRoomName: "",
        buildingDraft: "",
        roomDraft: "",
        buildingManualOpen: false,
      });
      this.emit();
    },

    /** 搜不到小区：以关键词作为新小区名提交（随线索进审核池，不阻塞提交） */
    onCommunityUseQuery() {
      const name = this.data.communityKeyword.trim();
      if (!name) {
        return;
      }
      this.setData({
        communityId: "",
        communityName: name,
        district: "",
        businessCircle: "",
        communityDropdown: false,
        communityResults: [],
        buildings: [],
        visibleBuildings: [],
        buildingId: null,
        buildingNo: "",
        buildingKeyword: "",
        floors: [],
        activeFloor: "all",
        rooms: [],
        visibleRooms: [],
        roomId: null,
        roomNo: "",
        dictStatus: "pending",
        newCommunityName: name,
        newBuildingName: "",
        newRoomName: "",
        buildingDraft: "",
        roomDraft: "",
        buildingManualOpen: false,
      });
      this.emit();
    },

    onBuildingSearch(e: WechatMiniprogram.Input) {
      const raw = e.detail.value || "";
      const keyword = raw.trim();
      this.setData({ buildingKeyword: keyword });
      this.clearBuildingTimer();
      this.buildingSearchSeq += 1;
      const seq = this.buildingSearchSeq;
      if (!keyword) {
        // 清空关键词 → 回到首屏全量（第一页）
        this.searchBuildings("", seq);
        return;
      }
      this.buildingSearchTimer = setTimeout(() => {
        this.buildingSearchTimer = null;
        this.searchBuildings(keyword, seq);
      }, DEBOUNCE_DELAY);
    },

    /** 楼栋号服务端搜索：keyword 透传字典接口，突破「只加载第一页」的限制 */
    searchBuildings(keyword: string, seq: number) {
      const communityId = this.data.communityId;
      if (!communityId) {
        return;
      }
      this.setData({ buildingsLoading: true });
      request<BdBuildingListResponse>({
        url: `/public/building-dictionary/communities/${communityId}/buildings`,
        data: { page: 1, page_size: BUILDING_PAGE_SIZE, keyword: keyword || undefined },
        skipAuth: true,
      })
        .then((res) => {
          if (seq !== this.buildingSearchSeq) {
            return;
          }
          const list = (res.items || []).map((b) => ({
            id: b.id,
            building_no: b.building_no,
            label: formatBuildingLabel(b.building_no),
            pending: b.pending,
            pending_id: b.pending_id ?? null,
            // 实表楼栋 id 唯一；pending 楼栋以「p+楼栋号」区分（同名 pending 由 uq_pending_open 防重）
            key: b.pending ? `p${b.building_no}` : `b${b.id}`,
          }));
          this.setData({ buildings: list, visibleBuildings: list, buildingsLoading: false });
        })
        .catch(() => {
          if (seq !== this.buildingSearchSeq) {
            return;
          }
          this.setData({ buildings: [], visibleBuildings: [], buildingsLoading: false });
        });
    },

    /** 展开「手动添加」弱化入口（搜索无结果的空态也会带上搜索词预填） */
    onToggleBuildingManual(e: WechatMiniprogram.BaseEvent) {
      const prefill = ((e.currentTarget.dataset.prefill as string) || "").trim();
      this.setData({
        buildingManualOpen: true,
        buildingDraft: this.data.buildingDraft || prefill,
      });
    },

    onNewBuildingInput(e: WechatMiniprogram.Input) {
      this.setData({ buildingDraft: e.detail.value || "" });
    },

    onNewRoomInput(e: WechatMiniprogram.Input) {
      this.setData({ roomDraft: e.detail.value || "" });
    },

    /**
     * 选中字典楼栋：加载楼层 + 户室.
     *
     * 待审楼栋（pending=true）在 C 端只做展示、不可选：pending 楼栋没有实表 id，
     * 选它无法级联出户室，而且 C 端没有「来源单据」概念，无法按 BR-23 回显选中。
     * 判定放在方法里而不是 wxml 的动态 bindtap 表达式（后者在小程序里不可靠）。
     */
    onBuildingPick(e: WechatMiniprogram.BaseEvent) {
      const ds = e.currentTarget.dataset;
      if (ds.pending) {
        wx.showToast({ title: "该楼栋审核中，通过后可选", icon: "none" });
        return;
      }
      const id = Number(ds.id);
      if (!id) {
        return;
      }
      this.setData({
        buildingId: id,
        buildingNo: (ds.no as string) || "",
        buildingLabel: formatBuildingLabel((ds.no as string) || ""),
        // 选回字典楼栋 → 之前「新建楼栋/户室」的待审载荷必须作废，否则会同时提交
        // 一个实表 building_id 和一条 new_building，后端 dict_status 判定会打架
        newBuildingName: "",
        buildingDraft: "",
        newRoomName: "",
        roomDraft: "",
        dictStatus: "linked",
        roomId: null,
        roomNo: "",
        activeFloor: "all",
      });
      this.loadRooms(id);
      this.emit();
    },

    /** 新建楼栋：只记名称，随线索提交进审核池（父级由后端按小区/待审小区解析） */
    onCreateBuilding() {
      if (!this.data.communityName) {
        wx.showToast({ title: "请先选择或填写小区", icon: "none" });
        return;
      }
      const name = (this.data.buildingDraft || "").trim();
      if (!name) {
        wx.showToast({ title: "请输入楼栋号", icon: "none" });
        return;
      }
      // 查重必须看全量楼栋而不是当前过滤结果：否则搜索「99」时搜不到已有的「8号楼」，
      // 用户会重复提交一条同名 pending
      if (this.data.buildings.some((b) => b.building_no === name)) {
        wx.showToast({ title: `楼栋「${name}」已存在，请直接选择`, icon: "none" });
        return;
      }
      this.setData({
        buildingId: null,
        buildingNo: name,
        buildingLabel: formatBuildingLabel(name),
        buildingKeyword: "",
        floors: [],
        activeFloor: "all",
        rooms: [],
        visibleRooms: [],
        roomId: null,
        roomNo: "",
        dictStatus: "pending",
        // 已确认的新增楼栋名（emit 依此产出 new_building 载荷）
        newBuildingName: name,
        newRoomName: "",
        buildingDraft: "",
        roomDraft: "",
        buildingManualOpen: false,
      });
      this.emit();
    },

    onFloorPick(e: WechatMiniprogram.BaseEvent) {
      const raw = e.currentTarget.dataset.floor;
      const floor = raw === "" || raw === undefined ? "all" : String(raw);
      const visible =
        floor === "all"
          ? this.data.rooms
          : this.data.rooms.filter((r) => String(r.floor ?? "") === floor);
      this.setData({ activeFloor: floor, visibleRooms: visible });
    },

    onRoomPick(e: WechatMiniprogram.BaseEvent) {
      const ds = e.currentTarget.dataset;
      // 待审户室仅来源单据可回显选中（BR-23）；C 端没有来源单据概念 → 只展示不可选
      if (ds.pending) {
        wx.showToast({ title: "该户室审核中，通过后可选", icon: "none" });
        return;
      }
      const id = Number(ds.id);
      const roomNo = (ds.no as string) || "";
      if (!roomNo) {
        return;
      }
      // 待审户室不在 C 端列表出现（仅来源单据可回显），此处只需区分实表/新建
      this.setData({
        roomId: id || null,
        roomNo,
        // 选到实表户室 → 作废「新建户室」载荷；否则保持 pending
        newRoomName: id ? "" : roomNo,
        roomDraft: "",
        dictStatus: id ? "linked" : "pending",
      });
      this.emit();
    },

    /** 新建户室：校验户室号（3-4 位纯数字且楼层位 > 0，与 admin 同口径） */
    onCreateRoom() {
      if (!this.data.buildingNo) {
        wx.showToast({ title: "请先选择或填写楼栋", icon: "none" });
        return;
      }
      const roomNo = (this.data.roomDraft || "").trim();
      if (!roomNo) {
        wx.showToast({ title: "请输入户室号", icon: "none" });
        return;
      }
      if (this.floorOfRoom(roomNo) == null) {
        wx.showToast({ title: "户室号需为3或4位数字且楼层位>0", icon: "none" });
        return;
      }
      if (this.data.rooms.some((r) => r.room_no === roomNo)) {
        wx.showToast({ title: `户室「${roomNo}」已存在，请直接选择`, icon: "none" });
        return;
      }
      this.setData({
        roomId: null,
        roomNo,
        // 已确认的新增户室名（emit 依此产出 new_room 载荷）
        newRoomName: roomNo,
        roomDraft: "",
        dictStatus: "pending",
      });
      this.emit();
    },

    clearTimer() {
      if (this.searchTimer !== null) {
        clearTimeout(this.searchTimer);
        this.searchTimer = null;
      }
    },

    clearBuildingTimer() {
      if (this.buildingSearchTimer !== null) {
        clearTimeout(this.buildingSearchTimer);
        this.buildingSearchTimer = null;
      }
    },

    floorOfRoom(roomNo: string): number | null {
      if (/^\d{4}$/.test(roomNo)) {
        const f = parseInt(roomNo.slice(0, 2), 10);
        return f > 0 ? f : null;
      }
      if (/^\d{3}$/.test(roomNo)) {
        const f = parseInt(roomNo[0], 10);
        return f > 0 ? f : null;
      }
      return null;
    },

    /** 初始加载楼栋首页（选中小区后调用；后续搜索走 searchBuildings） */
    loadBuildings(communityId: string) {
      this.buildingSearchSeq += 1;
      this.searchBuildings("", this.buildingSearchSeq);
    },

    /** 户室逐页取全后按楼层聚合（后端单页上限 500，超大楼栋需翻页） */
    loadRooms(buildingId: number) {
      this.setData({ roomsLoading: true });
      const collected: RoomOption[] = [];
      const fetchPage = (page: number): Promise<void> =>
        request<BdBuildingDetail>({
          url: `/public/building-dictionary/buildings/${buildingId}`,
          data: { room_page: page, room_page_size: ROOM_PAGE_SIZE },
          skipAuth: true,
        }).then((detail) => {
          (detail.rooms || []).forEach((r) => {
            collected.push({
              id: r.id,
              room_no: r.room_no,
              floor: r.floor ?? null,
              plate_no: r.plate_no,
              pending: r.pending,
              // 实表户室 id 唯一；pending 户室以「p+户室号」区分
              key: r.pending ? `p${r.room_no}` : `r${r.id}`,
            });
          });
          if (detail.room_has_more && page < ROOM_MAX_PAGES) {
            return fetchPage(page + 1);
          }
          return undefined;
        });

      fetchPage(1)
        .then(() => {
          const floorMap = new Map<string, FloorOption>();
          collected.forEach((r) => {
            const key = String(r.floor ?? "");
            const existed = floorMap.get(key);
            if (existed) {
              existed.count += 1;
              return;
            }
            floorMap.set(key, {
              key,
              floor: r.floor ?? null,
              label: r.floor == null ? "楼层待定" : `${r.floor} 层`,
              count: 1,
            });
          });
          const floors = Array.from(floorMap.values()).sort((a, b) => {
            if (a.floor == null) return 1;
            if (b.floor == null) return -1;
            return a.floor - b.floor;
          });
          this.setData({
            rooms: collected,
            visibleRooms: collected,
            floors,
            activeFloor: "all",
            roomsLoading: false,
          });
        })
        .catch(() => {
          this.setData({ rooms: [], visibleRooms: [], floors: [], roomsLoading: false });
        });
    },

    emit() {
      const value: DictAddressValue = {
        communityId: this.data.communityId,
        communityName: this.data.communityName,
        district: this.data.district,
        businessCircle: this.data.businessCircle,
        buildingId: this.data.buildingId,
        buildingNo: this.data.buildingNo,
        roomId: this.data.roomId,
        roomNo: this.data.roomNo,
        dictStatus: this.data.dictStatus,
        newCommunity: this.data.newCommunityName ? { name: this.data.newCommunityName } : null,
        newBuilding: this.data.newBuildingName ? { name: this.data.newBuildingName } : null,
        newRoom: this.data.newRoomName ? { name: this.data.newRoomName } : null,
      };
      this.triggerEvent("change", value);
    },
  },
});
