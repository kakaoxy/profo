/**
 * 「评估授权」页测试：viewMode 再次评估链路（canAdjust / adjust 面板提交 /
 * 冲突弹窗文案分支）与评估历史拉取映射.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, createRequestMock, pendingReqs, resetTestStubs, wxStubs } from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/url", () => ({
  resolveImageUrl: vi.fn((u: string) => u || ""),
}));
vi.mock("../../utils/valuation-display", () => ({
  formatDate: () => "2026-01-01",
}));

beforeAll(async () => {
  await import("../../pages/valuation/authorize/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function handledItem(status: string, evalPrice: number | null) {
  return {
    id: "h1",
    community_name: "已处理小区",
    district: "朝阳区",
    layout: null,
    area: 88,
    floor_info: "低楼层/15层",
    orientation: "东",
    remarks: null,
    expected_price: 300,
    images: [],
    source: "employee_entry",
    status,
    status_display: "—",
    eval_price: evalPrice,
    last_follow_up_at: "2026-01-05T00:00:00Z" as string | null,
    follow_up_count: 1,
    audit_time: "2026-01-01T00:00:00Z",
  };
}

function evalHistory(id: string, evalPrice: number, evaluatedAt: string, remark: string | null) {
  return { id, lead_id: "h1", eval_price: evalPrice, remark, evaluator_id: "op", evaluated_at: evaluatedAt };
}

beforeEach(() => {
  resetTestStubs();
});

function enterViewMode(ctx: AnyRecord, item: AnyRecord): void {
  ctx.onLoad({ id: "h1", mode: "view" });
  ctx.applyHandledItem(item);
}

/** 按方法+URL 查找请求（viewMode 的两个 GET 与提交 POST 并存于队列）. */
function findReq(url: string, method = "GET") {
  const req = pendingReqs().find((r) => r.opts.url === url && (r.opts as AnyRecord).method === method);
  if (!req) {
    throw new Error(`request not found: ${method} ${url}`);
  }
  return req;
}

describe("viewMode 详情与再次评估入口", () => {
  it("viewMode 并发拉取跟进记录与评估历史，历史倒序首条标记当前", async () => {
    const ctx = createPageHarness({});
    ctx.onLoad({ id: "h1", mode: "view" });

    expect(pendingReqs()).toHaveLength(2);
    const [followupsReq, evalsReq] = pendingReqs();
    expect(followupsReq.opts.url).toBe("/public/leads/my/acquired/h1/follow-ups");
    expect(evalsReq.opts.url).toBe("/public/leads/my/acquired/h1/evaluations");

    evalsReq.resolve([
      evalHistory("e2", 362.5, "2026-01-02T00:00:00Z", "看房后上调"),
      evalHistory("e1", 350, "2026-01-01T00:00:00Z", null),
    ]);
    followupsReq.resolve([]);
    await flush();

    expect(ctx.data.evalHistoriesLoaded).toBe(true);
    expect(ctx.data.evalHistories).toHaveLength(2);
    const [latest, first] = ctx.data.evalHistories;
    expect(latest.priceText).toBe("362.5");
    expect(latest.remarkText).toBe("看房后上调");
    expect(latest.isCurrent).toBe(true);
    expect(first.isCurrent).toBe(false);
    expect(ctx.data.followupsLoaded).toBe(true);
  });

  it("可调整状态（pending_visit/visited）置 canAdjust/canFollowup 并展示已授权价", () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));
    expect(ctx.data.canAdjust).toBe(true);
    expect(ctx.data.canFollowup).toBe(true);
    expect(ctx.data.statusTagText).toBe("已授权");
    expect(ctx.data.hasEvalPrice).toBe(true);
    expect(ctx.data.evalPriceText).toBe("350");
    // 「最近跟进」宫格：last_follow_up_at 优先
    expect(ctx.data.recentFollowupText).toBe("2026-01-01");

    const ctx2 = createPageHarness({});
    enterViewMode(ctx2, handledItem("visited", 320));
    expect(ctx2.data.canAdjust).toBe(true);
    expect(ctx2.data.canFollowup).toBe(true);
    expect(ctx2.data.statusTagText).toBe("已看房");
    expect(ctx2.data.hasEvalPrice).toBe(true);
  });

  it("无跟进记录时「最近跟进」回退 audit_time", () => {
    const ctx = createPageHarness({});
    const item = handledItem("pending_visit", 350);
    item.last_follow_up_at = null;
    enterViewMode(ctx, item);
    expect(ctx.data.recentFollowupText).toBe("2026-01-01");
  });

  it("终态（rejected/lost）不可调整评估价、不可登记跟进", () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("rejected", null));
    expect(ctx.data.canAdjust).toBe(false);
    expect(ctx.data.canFollowup).toBe(false);

    const ctx2 = createPageHarness({});
    enterViewMode(ctx2, handledItem("lost_to_competitor", null));
    expect(ctx2.data.canAdjust).toBe(false);
    expect(ctx2.data.canFollowup).toBe(false);
  });
});

describe("登记跟进（followup）提交链路", () => {
  it("打开面板默认电话 → 输入内容 → 提交 POST follow-ups，成功后 toast 并返回", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openFollowupPanel();
    expect(ctx.data.panelMode).toBe("followup");
    expect(ctx.data.followupMethod).toBe("phone");
    expect(ctx.data.followupContent).toBe("");

    // 切换跟进方式
    ctx.onFollowupMethodTap({ currentTarget: { dataset: { method: "wechat" } } });
    expect(ctx.data.followupMethod).toBe("wechat");

    ctx.onFollowupContentInput({ detail: { value: "微信确认看房时间" } });
    ctx.submitFollowup();

    const req = findReq("/public/leads/my/acquired/h1/follow-ups", "POST");
    expect(req.opts.data).toEqual({ method: "wechat", content: "微信确认看房时间" });

    req.resolve({ id: "f9", method: "wechat", content: "微信确认看房时间", followed_at: "2026-01-06T00:00:00Z" });
    await flush();
    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "已登记跟进", icon: "success" });
    await new Promise((r) => setTimeout(r, 650));
    expect(wxStubs.navigateBack).toHaveBeenCalled();
  }, 10_000);

  it("空内容阻止提交；409 弹「线索已关闭，无法登记跟进」冲突弹窗", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openFollowupPanel();
    ctx.submitFollowup();
    // 空内容：不发请求，面板内提示
    expect(pendingReqs().some((r) => (r.opts as AnyRecord).method === "POST")).toBe(false);
    expect(ctx.data.formError).toBe("请填写跟进内容");

    ctx.onFollowupContentInput({ detail: { value: "电话跟进" } });
    ctx.submitFollowup();
    findReq("/public/leads/my/acquired/h1/follow-ups", "POST").reject({
      statusCode: 409,
      body: { message: "该线索已关闭，无法登记跟进" },
    });
    await flush();

    expect(ctx.data.showConflict).toBe(true);
    expect(ctx.data.panelMode).toBe("");
    expect(ctx.data.conflictTitle).toBe("线索状态已变化");
    expect(ctx.data.conflictDesc).toContain("无法登记跟进");
  });
});

describe("viewMode lost 入口与 409 文案分档", () => {
  it("viewMode 打开 lost 面板并提交 authorize-assessment 成功", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openPanel({ currentTarget: { dataset: { mode: "lost" } } });
    expect(ctx.data.panelMode).toBe("lost");

    ctx.submitAuthorize();
    const req = findReq("/public/leads/my/acquired/h1/authorize-assessment", "POST");
    expect(req.opts.data).toEqual({ action: "lost" });
    req.resolve({ id: "h1", status: "lost_to_competitor", status_display: "他司已成交", eval_price: 350 });
    await flush();
    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "已标记他司成交", icon: "success" });
  }, 10_000);

  it("lost 提交 409：弹「不可标记为他司成交」文案（与 adjust/default 区分）", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openPanel({ currentTarget: { dataset: { mode: "lost" } } });
    ctx.submitAuthorize();
    findReq("/public/leads/my/acquired/h1/authorize-assessment", "POST").reject({
      statusCode: 409,
      body: { message: "该线索当前状态不可标记为他司成交" },
    });
    await flush();

    expect(ctx.data.showConflict).toBe(true);
    expect(ctx.data.conflictDesc).toContain("不可标记为他司成交");
  });
});

describe("再次评估（adjust）提交链路", () => {
  it("打开 adjust 面板 → 输入新价 → 提交 POST evaluations，成功后 toast 并返回", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openAdjustPanel();
    expect(ctx.data.panelMode).toBe("adjust");
    expect(ctx.data.confirmText).toBe("确认调整");

    ctx.onPriceInput({ detail: { value: "362.5" } });
    expect(ctx.data.canConfirm).toBe(true);
    expect(ctx.data.confirmText).toBe("确认调整 ¥362.5 万");
    expect(ctx.data.diffType).toBe("warn"); // 高于业主报价 300 → 62.5
    expect(ctx.data.diffValue).toBe("62.5");

    ctx.submitAuthorize();
    const req = findReq("/public/leads/my/acquired/h1/evaluations", "POST");
    expect(req.opts.data).toEqual({ eval_price: 362.5 });

    req.resolve({ id: "e3", eval_price: 362.5 });
    await flush();
    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "评估价已更新", icon: "success" });
    // 600ms 后 navigateBack 返回工作台
    await new Promise((r) => setTimeout(r, 650));
    expect(wxStubs.navigateBack).toHaveBeenCalled();
  }, 10_000);

  it("adjust 提交 409：弹「线索状态已变化」冲突弹窗并关闭面板", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("visited", 320));

    ctx.openAdjustPanel();
    ctx.onPriceInput({ detail: { value: "330" } });
    ctx.submitAuthorize();
    findReq("/public/leads/my/acquired/h1/evaluations", "POST").reject({
      statusCode: 409,
      body: { message: "仅待看房/已看房状态的线索可调整评估价" },
    });
    await flush();

    expect(ctx.data.showConflict).toBe(true);
    expect(ctx.data.panelMode).toBe("");
    expect(ctx.data.conflictTitle).toBe("线索状态已变化");
    expect(ctx.data.conflictDesc).toContain("不支持调整评估价");
  });

  it("adjust 提交 403：面板内展示权限错误", async () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openAdjustPanel();
    ctx.onPriceInput({ detail: { value: "360" } });
    ctx.submitAuthorize();
    findReq("/public/leads/my/acquired/h1/evaluations", "POST").reject({ statusCode: 403, body: {} });
    await flush();

    expect(ctx.data.showConflict).toBe(false);
    expect(ctx.data.formError).toBe("仅管理员/运营人员可执行此操作");
  });

  it("评估价非法时确认按钮禁用（canConfirm=false 阻止提交）", () => {
    const ctx = createPageHarness({});
    enterViewMode(ctx, handledItem("pending_visit", 350));

    ctx.openAdjustPanel();
    ctx.onPriceInput({ detail: { value: "12." } }); // 输入中间态不闪红
    expect(ctx.data.canConfirm).toBe(false);
    ctx.submitAuthorize();
    // 仅 viewMode 的两个 GET 在队列，未发出任何提交 POST
    expect(pendingReqs().some((r) => (r.opts as AnyRecord).method === "POST")).toBe(false);
  });
});

describe("默认模式三动作与冲突文案", () => {
  it("approve 提交 409：弹「该线索已被完成评估」默认文案", async () => {
    const ctx = createPageHarness({});
    ctx.onLoad({ id: "p1" });
    ctx.applyItem({
      id: "p1",
      community_name: "待评估小区",
      district: "朝阳区",
      layout: "2室1厅",
      area: 90,
      floor_info: "高楼层/28层",
      orientation: "南北",
      remarks: null,
      expected_price: 300,
      images: [],
      source: "customer_share",
      created_at: "2026-01-01T00:00:00Z",
    });

    ctx.openPanel({ currentTarget: { dataset: { mode: "approve" } } });
    expect(ctx.data.panelMode).toBe("approve");
    ctx.onPriceInput({ detail: { value: "350" } });
    ctx.submitAuthorize();

    const [req] = pendingReqs();
    expect(req.opts.url).toBe("/public/leads/my/acquired/p1/authorize-assessment");
    req.reject({ statusCode: 409, body: { message: "该线索已被处理" } });
    await flush();

    expect(ctx.data.showConflict).toBe(true);
    expect(ctx.data.conflictTitle).toBe("该线索已被完成评估");
  });
});