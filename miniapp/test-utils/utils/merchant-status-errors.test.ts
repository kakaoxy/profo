import { describe, expect, it } from "vitest";

import { describeRequestError } from "../../utils/merchant-errors";
import {
  agreementStatusLabel,
  agreementStatusTone,
  storeStatusLabel,
  storeStatusTone,
} from "../../utils/merchant-status";

/**
 * 状态语义（DESIGN M3 / 审查报告 P0-6）。
 * 改造前同一个 Apricot 同时表示「待处理 / 已完成 / 已作废 / 已过期」，用户无法从颜色判断要做什么。
 * 这里锁死三档映射，页面不许再各写三元表达式。
 */
describe("合作状态 → 三档语义", () => {
  it("待处理只有 negotiating", () => {
    expect(storeStatusTone("approved", "negotiating")).toBe("todo");
  });

  it("已落定：正常 / 已合作", () => {
    expect(storeStatusTone("approved", "not_cooperated")).toBe("done");
    expect(storeStatusTone("approved", "cooperated")).toBe("done");
  });

  it("异常：暂停 / 终止", () => {
    expect(storeStatusTone("approved", "paused")).toBe("void");
    expect(storeStatusTone("approved", "terminated")).toBe("void");
  });

  it("审核未通过时审核状态优先，压过合作状态", () => {
    expect(storeStatusTone("pending", "cooperated")).toBe("todo");
  });

  it("标签：审核未完成给审核结论，审核通过后给业务状态", () => {
    expect(storeStatusLabel("pending", "已合作")).toBe("待审核");
    expect(storeStatusLabel("approved", "已合作")).toBe("已合作");
    expect(storeStatusLabel("approved", "洽谈中")).toBe("洽谈中");
    expect(storeStatusLabel("merged", "已合作")).toBe("已合并");
    // 字典缺失时才回落到审核结论，避免整列都显示「已通过」
    expect(storeStatusLabel("approved", "")).toBe("已通过");
  });

  it("未知状态码回落到已落定，不会再冒出第四档颜色", () => {
    expect(storeStatusTone("approved", "brand_new_code")).toBe("done");
    expect(agreementStatusTone("brand_new_code")).toBe("done");
  });
});

describe("协议状态 → 三档语义", () => {
  it("待签署是唯一待处理", () => {
    expect(agreementStatusTone("pending_sign")).toBe("todo");
  });

  it("已签署与未发起是已落定", () => {
    expect(agreementStatusTone("signed")).toBe("done");
    expect(agreementStatusTone("not_initiated")).toBe("done");
  });

  it("过期与作废是异常", () => {
    expect(agreementStatusTone("expired")).toBe("void");
    expect(agreementStatusTone("voided")).toBe("void");
  });

  it("中文标签优先用后端下发的，缺失时回落本地映射", () => {
    expect(agreementStatusLabel("pending_sign", "等待商户签章")).toBe("等待商户签章");
    expect(agreementStatusLabel("pending_sign")).toBe("待签署");
    expect(agreementStatusLabel("voided")).toBe("已作废");
    expect(agreementStatusLabel("unknown_code")).toBe("unknown_code");
    expect(agreementStatusLabel("not_initiated")).toBe("未发起");
    expect(agreementStatusLabel("expired")).toBe("已过期");
  });
});

/**
 * 错误文案（审查报告 T11）。
 * 改造前 10 个页面各写一份 errMessage，兜底都是「网络异常，请重试」——不可诊断。
 */
describe("describeRequestError 优先级", () => {
  it("后端 message 最具体，排第一", () => {
    const err = { statusCode: 409, body: { message: "该门店已被其他员工修改" } };
    expect(describeRequestError(err, "保存失败")).toBe("该门店已被其他员工修改");
  });

  it("无 message 时按状态码给可执行文案", () => {
    expect(describeRequestError({ statusCode: 401 }, "保存失败")).toBe("登录状态已过期，请重新登录后再试");
    expect(describeRequestError({ statusCode: 403 }, "保存失败")).toBe("当前账号没有商户拓展权限，请联系管理员开通");
    expect(describeRequestError({ statusCode: 404 }, "保存失败")).toBe("记录不存在或已被删除");
    expect(describeRequestError({ statusCode: 503 }, "保存失败")).toBe("服务端暂时不可用，稍后再试");
  });

  it("未登记的状态码保留页面兜底并附上码值，便于排查", () => {
    expect(describeRequestError({ statusCode: 418 }, "保存失败")).toBe("保存失败（HTTP 418）");
  });

  it("网络层错误说明是网络问题，而不是笼统的「异常」", () => {
    expect(describeRequestError({ errMsg: "request:fail timeout" }, "保存失败")).toBe(
      "网络连接失败（request:fail timeout），请检查网络后重试",
    );
  });

  it("拿不到任何信息时用页面兜底", () => {
    expect(describeRequestError(new Error("boom"), "门店加载失败")).toBe("门店加载失败");
    expect(describeRequestError(null, "门店加载失败")).toBe("门店加载失败");
    expect(describeRequestError(undefined, "门店加载失败")).toBe("门店加载失败");
  });
});
