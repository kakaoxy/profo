import { describe, expect, it } from "vitest";
import {
  consumeProjectListPendingTab,
  setProjectListPendingTab,
} from "./project-list-tab";

describe("project-list-tab pending tab", () => {
  it("未写入时 consume 返回 null", () => {
    expect(consumeProjectListPendingTab()).toBeNull();
  });

  it("set 后 consume 返回对应 tab 并清空", () => {
    setProjectListPendingTab("sold");
    expect(consumeProjectListPendingTab()).toBe("sold");
    // 消费后即清除，再次 consume 返回 null
    expect(consumeProjectListPendingTab()).toBeNull();
  });

  it("重复写入只保留最后一次", () => {
    setProjectListPendingTab("sold");
    setProjectListPendingTab("sold");
    expect(consumeProjectListPendingTab()).toBe("sold");
  });
});
