import { describe, expect, it } from "vitest";
import {
  buildShareEventPayload,
  buildSharePath,
  buildShareQuery,
  checkRecruitForm,
  formatLeadTime,
  isDeepView,
  parseRecruitQuery,
  parseSceneCode,
  RECRUIT_LANDING_CONTENT,
  RECRUIT_LEAD_STATUS_CHIPS,
  toMyLeadDisplayItem,
  applyLeadPhone,
  type RecruitMyLeadItem,
} from "./recruit-logic";

describe("parseRecruitQuery", () => {
  it("解析出 campaign_id / referrer / source", () => {
    const q = parseRecruitQuery({ campaign_id: "abc", referrer: "emp1", source: "poster" });
    expect(q).toEqual({ campaignId: "abc", referrer: "emp1", source: "poster" });
  });

  it("source 非 poster 时默认 card", () => {
    expect(parseRecruitQuery({ source: "unknown" }).source).toBe("card");
    expect(parseRecruitQuery({}).source).toBe("card");
  });

  it("缺省 campaign_id 用兜底值", () => {
    expect(parseRecruitQuery({}, "fallback").campaignId).toBe("fallback");
    expect(parseRecruitQuery({}).campaignId).toBe("");
  });

  it("referrer 缺省为空串", () => {
    expect(parseRecruitQuery({}).referrer).toBe("");
  });
});

describe("isDeepView", () => {
  it("停留 >= 3000ms 判定深度浏览", () => {
    expect(isDeepView(3000)).toBe(true);
    expect(isDeepView(5000)).toBe(true);
  });

  it("停留 < 3000ms 非深度浏览", () => {
    expect(isDeepView(2999)).toBe(false);
    expect(isDeepView(0)).toBe(false);
  });
});

describe("checkRecruitForm", () => {
  it("主营商圈为空提示先填写商圈", () => {
    expect(checkRecruitForm("", true)).toBe("请先填写主营商圈");
    expect(checkRecruitForm("   ", false)).toBe("请先填写主营商圈");
  });

  it("商圈已填但未勾协议提示先阅读协议", () => {
    expect(checkRecruitForm("静安", false)).toBe("请先阅读并同意隐私协议");
  });

  it("全部通过返回空串", () => {
    expect(checkRecruitForm("静安", true)).toBe("");
  });
});

describe("buildShareQuery", () => {
  it("带 referrer 生成 query 串（不含 path）", () => {
    expect(buildShareQuery("abc", "emp1", "card")).toBe(
      "campaign_id=abc&referrer=emp1&source=card",
    );
  });

  it("无 referrer 时省略该参数", () => {
    expect(buildShareQuery("abc", "", "poster")).toBe(
      "campaign_id=abc&source=poster",
    );
  });

  it("对特殊字符进行 encodeURIComponent", () => {
    expect(buildShareQuery("a&b", "张三", "card")).toBe(
      "campaign_id=a%26b&referrer=%E5%BC%A0%E4%B8%89&source=card",
    );
  });
});

describe("buildSharePath", () => {
  it("带 referrer 生成完整 path", () => {
    expect(buildSharePath("abc", "emp1", "card")).toBe(
      "/pages/recruit/detail/index?campaign_id=abc&referrer=emp1&source=card",
    );
  });

  it("无 referrer 时省略该参数", () => {
    expect(buildSharePath("abc", "", "poster")).toBe(
      "/pages/recruit/detail/index?campaign_id=abc&source=poster",
    );
  });
});

describe("RECRUIT_LANDING_CONTENT", () => {
  it("Hero 含 title / lead / tags / closerPrefix / closerBold", () => {
    const { hero } = RECRUIT_LANDING_CONTENT;
    expect(hero.title).toBe("你缺客户吗？");
    expect(hero.lead).toBe("我们就是那个——");
    expect(hero.tags).toEqual(["不约时间", "不磨价格", "不玩消失"]);
    expect(hero.closerPrefix).toBe("的");
    expect(hero.closerBold).toContain("神仙客户");
  });

  it("数据卡含 3 项（经纪人 / 商圈 / 佣金），target 为数值用于滚动", () => {
    const { stats } = RECRUIT_LANDING_CONTENT;
    expect(stats).toHaveLength(3);
    expect(stats[0].target).toBe(300);
    expect(stats[0].suffix).toBe("+");
    expect(stats[0].unit).toBe("人");
    expect(stats[0].label).toBe("已合作经纪人");
    expect(stats[1].target).toBe(15);
    expect(stats[1].unit).toBe("个");
    expect(stats[1].label).toBe("覆盖商圈");
    expect(stats[2].yen).toBe("¥");
    expect(stats[2].target).toBe(1000);
    expect(stats[2].suffix).toBe("W+");
    expect(stats[2].label).toBe("累计佣金");
  });

  it("痛点含 3 项且仅中项 warm=true", () => {
    const { pains } = RECRUIT_LANDING_CONTENT;
    expect(pains).toHaveLength(3);
    expect(pains.map((p) => p.warm)).toEqual([false, true, false]);
    expect(pains.every((p) => p.q && p.aBold)).toBe(true);
  });

  it("优势含 4 项 01-04 编号", () => {
    const { whys } = RECRUIT_LANDING_CONTENT;
    expect(whys).toHaveLength(4);
    expect(whys.map((w) => w.num)).toEqual(["01", "02", "03", "04"]);
    expect(whys.every((w) => w.title && w.desc)).toBe(true);
  });

  it("流程含 5 步", () => {
    const { flow } = RECRUIT_LANDING_CONTENT;
    expect(flow).toHaveLength(5);
    expect(flow[0].name).toBe("推荐房源");
    expect(flow[4].name).toBe("佣金到账");
    expect(flow.every((f) => f.name && f.desc)).toBe(true);
  });

  it("评价含 2 条且 stars=5", () => {
    const { reviews } = RECRUIT_LANDING_CONTENT;
    expect(reviews).toHaveLength(2);
    expect(reviews.every((r) => r.stars === 5)).toBe(true);
    expect(reviews[0].name).toBe("洪店长");
    expect(reviews[1].name).toBe("李店长");
    expect(reviews.every((r) => r.avatar && r.text && r.role)).toBe(true);
  });

  it("区段标题字段齐全", () => {
    const { painTitle, whyTitle, flowTitle, reviewTitle } = RECRUIT_LANDING_CONTENT;
    expect(painTitle).toBe("我们懂你的每一个痛点");
    expect(whyTitle).toBe("为什么选择跟我们合作？");
    expect(flowTitle).toBe("合作流程");
    expect(reviewTitle).toBe("合作伙伴怎么说？");
  });
});

describe("buildShareEventPayload", () => {
  it("生成 card 分享事件体", () => {
    const payload = buildShareEventPayload("abc", "card");
    expect(payload).toEqual({ campaign_id: "abc", share_type: "card" });
  });

  it("生成 poster 分享事件体", () => {
    const payload = buildShareEventPayload("abc", "poster");
    expect(payload).toEqual({ campaign_id: "abc", share_type: "poster" });
  });

  it("无 campaign_id 时 campaign_id 为 undefined", () => {
    const payload = buildShareEventPayload("", "card");
    expect(payload.campaign_id).toBeUndefined();
  });
});

describe("parseSceneCode", () => {
  it("从键值对 scene 中提取短码", () => {
    expect(parseSceneCode("code=ab12cd34")).toBe("ab12cd34");
  });

  it("从含多个参数的 scene 中提取短码", () => {
    expect(parseSceneCode("code=ab12cd34&ch=print")).toBe("ab12cd34");
  });

  it("兼容带路径前缀的 scene 形态", () => {
    expect(parseSceneCode("pages/recruit/detail/index?code=ab12cd34")).toBe("ab12cd34");
  });

  it("无 code 键时返回空串", () => {
    expect(parseSceneCode("ch=print")).toBe("");
    expect(parseSceneCode("")).toBe("");
  });
});

describe("RECRUIT_LEAD_STATUS_CHIPS", () => {
  it("chips 顺序与文案对照设计稿（全部 + 5 个状态）", () => {
    expect(RECRUIT_LEAD_STATUS_CHIPS).toEqual([
      { label: "全部", value: "" },
      { label: "新线索", value: "new" },
      { label: "已联系", value: "contacted" },
      { label: "意向高", value: "high_intent" },
      { label: "已转化", value: "converted" },
      { label: "已淘汰", value: "eliminated" },
    ]);
  });
});

describe("formatLeadTime", () => {
  const now = new Date("2026-08-15T20:00:00");

  it("当天显示 今天 HH:mm", () => {
    expect(formatLeadTime("2026-08-15T14:32:00+08:00", now)).toBe("今天 14:32");
    expect(formatLeadTime("2026-08-15T00:05:00+08:00", now)).toBe("今天 00:05");
  });

  it("昨天显示 昨天 HH:mm", () => {
    expect(formatLeadTime("2026-08-14T19:47:00+08:00", now)).toBe("昨天 19:47");
  });

  it("同年更早显示 MM-DD HH:mm", () => {
    expect(formatLeadTime("2026-08-12T16:40:00+08:00", now)).toBe("08-12 16:40");
    expect(formatLeadTime("2026-01-02T09:00:00+08:00", now)).toBe("01-02 09:00");
  });

  it("跨年显示 YYYY-MM-DD", () => {
    expect(formatLeadTime("2025-12-31T23:59:00+08:00", now)).toBe("2025-12-31");
  });

  it("非法时间返回空串", () => {
    expect(formatLeadTime("not-a-date", now)).toBe("");
  });
});

describe("toMyLeadDisplayItem", () => {
  const now = new Date("2026-08-15T20:00:00");

  const item: RecruitMyLeadItem = {
    id: "lead-1",
    phone_masked: "138****5678",
    main_business_area: "朝阳区 · 望京商圈",
    status: "new",
    source: "poster",
    created_at: "2026-08-15T14:32:00+08:00",
  };

  it("映射状态/来源标签与相对时间", () => {
    expect(toMyLeadDisplayItem(item, now)).toEqual({
      id: "lead-1",
      phone: "138****5678",
      phoneFull: "",
      area: "朝阳区 · 望京商圈",
      statusValue: "new",
      statusText: "新线索",
      statusClass: "t-new",
      sourceText: "海报",
      sourceClass: "s-poster",
      timeText: "今天 14:32",
    });
  });

  it("五种状态标签文案与样式类齐全", () => {
    const cases: Array<[RecruitMyLeadItem["status"], string, string]> = [
      ["new", "新线索", "t-new"],
      ["contacted", "已联系", "t-contact"],
      ["high_intent", "意向高", "t-high"],
      ["converted", "已转化", "t-won"],
      ["eliminated", "已淘汰", "t-out"],
    ];
    for (const [status, text, cls] of cases) {
      const display = toMyLeadDisplayItem({ ...item, status }, now);
      expect(display.statusText).toBe(text);
      expect(display.statusClass).toBe(cls);
    }
  });

  it("card 来源显示卡片标签", () => {
    const display = toMyLeadDisplayItem({ ...item, source: "card" }, now);
    expect(display.sourceText).toBe("卡片");
    expect(display.sourceClass).toBe("s-card");
  });

  it("phone_masked 为空时显示未提供", () => {
    const display = toMyLeadDisplayItem({ ...item, phone_masked: null }, now);
    expect(display.phone).toBe("未提供");
  });
});

describe("applyLeadPhone", () => {
  const now = new Date("2026-08-15T20:00:00");

  const base: RecruitMyLeadItem = {
    id: "lead-1",
    phone_masked: "138****5678",
    main_business_area: "朝阳区 · 望京商圈",
    status: "new",
    source: "card",
    created_at: "2026-08-15T14:32:00+08:00",
  };

  it("填充完整号码并按接口状态刷新标签（new→contacted）", () => {
    const display = toMyLeadDisplayItem(base, now);
    const updated = applyLeadPhone(display, "13800005678", "contacted");
    expect(updated.phoneFull).toBe("13800005678");
    expect(updated.statusValue).toBe("contacted");
    expect(updated.statusText).toBe("已联系");
    expect(updated.statusClass).toBe("t-contact");
    // 原对象不可变：脱敏号与其余字段保留
    expect(display.phoneFull).toBe("");
    expect(updated.phone).toBe("138****5678");
    expect(updated.area).toBe("朝阳区 · 望京商圈");
  });

  it("非 new 状态按返回值原样展示", () => {
    const display = toMyLeadDisplayItem({ ...base, status: "converted" }, now);
    const updated = applyLeadPhone(display, "13800005678", "converted");
    expect(updated.statusText).toBe("已转化");
    expect(updated.statusClass).toBe("t-won");
  });
});
