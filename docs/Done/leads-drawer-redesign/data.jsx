/* global window */
// ============================================================
// Mock 数据：线索列表 + 线索详情 + 跟进记录 + 价格历史 + 市场数据
// 用 IIFE 包裹避免顶层 const 在热重载时触发 "Identifier already declared"
// ============================================================

(function (window) {
  const LEAD_STATUSES = {
    PENDING_ASSESSMENT: "pending_assessment",
    PENDING_VISIT: "pending_visit",
    VISITED: "visited",
    SIGNED: "signed",
    REJECTED: "rejected",
  };

const STATUS_LABELS = {
  pending_assessment: "待评估",
  pending_visit: "待看房",
  visited: "已看房",
  signed: "已签约",
  rejected: "已驳回",
};

const STATUS_CLASS_MAP = {
  pending_assessment: "status-pending",
  pending_visit: "status-visit",
  visited: "status-visited",
  signed: "status-signed",
  rejected: "status-rejected",
};

// —— 线索列表 ——
const LEADS_LIST = [
  {
    id: "LD-2024-0188",
    communityName: "陆家嘴中央公寓",
    layout: "3室2厅2卫",
    area: 128.6,
    totalPrice: 1280,
    unitPrice: 9.95,
    status: LEAD_STATUSES.PENDING_ASSESSMENT,
    district: "浦东新区",
    businessArea: "陆家嘴",
    creatorName: "张三",
    createdAt: "2026-07-22 14:32",
    imagesCount: 6,
  },
  {
    id: "LD-2024-0187",
    communityName: "仁恒河滨城",
    layout: "2室2厅1卫",
    area: 96.4,
    totalPrice: 880,
    unitPrice: 9.13,
    status: LEAD_STATUSES.PENDING_VISIT,
    district: "浦东新区",
    businessArea: "塘桥",
    creatorName: "李四",
    createdAt: "2026-07-21 10:15",
    imagesCount: 4,
  },
  {
    id: "LD-2024-0186",
    communityName: "中粮海景壹号",
    layout: "4室2厅2卫",
    area: 168.2,
    totalPrice: 2200,
    unitPrice: 13.08,
    status: LEAD_STATUSES.VISITED,
    district: "浦东新区",
    businessArea: "陆家嘴",
    creatorName: "张三",
    createdAt: "2026-07-19 16:48",
    imagesCount: 8,
  },
  {
    id: "LD-2024-0185",
    communityName: "浦江华侨城",
    layout: "2室1厅1卫",
    area: 78.5,
    totalPrice: 540,
    unitPrice: 6.88,
    status: LEAD_STATUSES.SIGNED,
    district: "闵行区",
    businessArea: "浦江镇",
    creatorName: "王五",
    createdAt: "2026-07-15 09:22",
    imagesCount: 3,
  },
  {
    id: "LD-2024-0184",
    communityName: "古北御庭",
    layout: "3室2厅2卫",
    area: 145.8,
    totalPrice: 1680,
    unitPrice: 11.52,
    status: LEAD_STATUSES.REJECTED,
    district: "长宁区",
    businessArea: "古北",
    creatorName: "李四",
    createdAt: "2026-07-12 11:30",
    imagesCount: 5,
  },
];

// —— 线索详情（用于抽屉）——
const LEAD_DETAIL = {
  id: "LD-2024-0188",
  communityName: "陆家嘴中央公寓",
  communityId: "C-1042",
  layout: "3室2厅2卫",
  orientation: "南北",
  floorInfo: "18/24层",
  area: 128.6,
  totalPrice: 1280,
  unitPrice: 9.95,
  evalPrice: 1180,
  status: LEAD_STATUSES.PENDING_ASSESSMENT,
  auditReason: "",
  auditTime: "",
  updatedAt: "2026-07-22 14:32",
  images: [
    "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=floor%20plan%20modern%20apartment%203%20bedroom%20blueprint%20clean&image_size=landscape_4_3",
    "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=living%20room%20bright%20modern%20apartment%20interior%20natural%20light&image_size=landscape_4_3",
    "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=master%20bedroom%20modern%20apartment%20large%20window&image_size=landscape_4_3",
    "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=kitchen%20modern%20apartment%20clean%20design&image_size=landscape_4_3",
    "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=bathroom%20modern%20apartment%20clean%20tile&image_size=landscape_4_3",
    "https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=balcony%20view%20city%20skyline%20apartment&image_size=landscape_4_3",
  ],
  district: "浦东新区",
  businessArea: "陆家嘴",
  remarks:
    "业主诚心出售，房屋精装修可直接入住，南北通透户型采光极佳。满五年唯一住房，无抵押无租赁。学区对应明珠小学（陆家嘴校区），初中建平西校。可随时签约，价格可小议。",
  creatorName: "张三",
  lastFollowUpAt: "2026-07-23 10:18",
  createdAt: "2026-07-22 14:32",
};

// —— 跟进记录 ——
const FOLLOW_UPS = [
  {
    id: "FU-001",
    method: "phone",
    content:
      "首次电话沟通：业主表示诚心出售，房屋自住保养良好，2019 年精装修。已确认无抵押无租赁，可随时安排看房。业主心理价位 1250 万，可议。",
    followedAt: "2026-07-23T10:18:00",
    createdBy: "张三",
  },
  {
    id: "FU-002",
    method: "wechat",
    content:
      "微信补充：业主发送了房屋户型图、产证信息、物业费缴纳凭证。产证面积 128.6㎡，物业费 4.5 元/㎡/月。",
    followedAt: "2026-07-22T16:45:00",
    createdBy: "张三",
  },
];

// —— 价格历史 ——
const PRICE_HISTORY = [
  {
    id: "PH-003",
    price: 1280,
    remark: "第三次降价，业主诚心出售",
    recordedAt: "2026-07-22 14:32",
    delta: -20,
    deltaPct: -1.54,
  },
  {
    id: "PH-002",
    price: 1300,
    remark: "二次调价",
    recordedAt: "2026-07-18 09:15",
    delta: -40,
    deltaPct: -2.99,
  },
  {
    id: "PH-001",
    price: 1340,
    remark: "Initial Creation",
    recordedAt: "2026-06-25 11:20",
    delta: 0,
    deltaPct: 0,
  },
];

// —— 市场数据（数据大盘）——
const MARKET_DATA = {
  community: {
    name: "陆家嘴中央公寓",
    avgPrice: 102580,
    avgPriceChange: -1.2,
    totalListing: 24,
    deals12m: 38,
    inventoryMonths: 7.6,
    avgDaysOnMarket: 42,
  },
  trend12m: [
    { month: "8月", value: 108200 },
    { month: "9月", value: 107500 },
    { month: "10月", value: 106800 },
    { month: "11月", value: 105900 },
    { month: "12月", value: 105200 },
    { month: "1月", value: 104800 },
    { month: "2月", value: 104100 },
    { month: "3月", value: 103500 },
    { month: "4月", value: 103900 },
    { month: "5月", value: 104200 },
    { month: "6月", value: 103100 },
    { month: "7月", value: 102580 },
  ],
  supply: {
    newListing7d: 3,
    removedListing7d: 1,
    totalActive: 24,
  },
  demand: {
    inquiries7d: 18,
    viewings7d: 6,
    deals30d: 4,
  },
  competitors: [
    {
      name: "陆家嘴中央公寓 · 3室2厅 · 132㎡",
      price: 1290,
      daysOnMarket: 35,
      isCurrent: true,
    },
    {
      name: "中粮海景壹号 · 3室2厅 · 138㎡",
      price: 1480,
      daysOnMarket: 28,
      isCurrent: false,
    },
    {
      name: "汤臣豪园三期 · 3室2厅 · 125㎡",
      price: 1190,
      daysOnMarket: 52,
      isCurrent: false,
    },
    {
      name: "鹏利海德 · 3室2厅 · 130㎡",
      price: 1320,
      daysOnMarket: 41,
      isCurrent: false,
    },
    {
      name: "仁恒滨江园 · 3室2厅 · 135㎡",
      price: 1390,
      daysOnMarket: 18,
      isCurrent: false,
    },
  ],
  aiStrategy: {
    score: 78,
    recommendation: "建议收购",
    points: [
      "业主报价 9.95 万/㎡ 略低于小区均价 10.26 万/㎡，议价空间约 5-8%",
      "南北通透 + 高楼层（18/24），户型稀缺性高，符合 Flip 优化条件",
      "明珠小学 + 建平西校双学区加持，二手房流通性强，去化周期约 6-8 周",
      "建议评估价 1180 万，预期翻新后挂牌价 1380-1420 万，毛利率 14-18%",
    ],
  },
};

  // —— 暴露到 window ——
  Object.assign(window, {
    LEAD_STATUSES,
    STATUS_LABELS,
    STATUS_CLASS_MAP,
    LEADS_LIST,
    LEAD_DETAIL,
    FOLLOW_UPS,
    PRICE_HISTORY,
    MARKET_DATA,
  });
})(window);
