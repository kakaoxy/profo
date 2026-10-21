import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

/**
 * BR-29 目标选择器 · 「初始空数组不得上报 empty」防死锁回归用例（必须保留）.
 *
 * 真实缺陷（本迭代被既有 E2E 抓到）：`buildings.length === 0` 在**初始态**也为真，
 * 首帧就上报 `empty` → 审核弹层把默认动作切成「确认新增」→ `needTarget` 变 false
 * → 本组件被卸载 → 楼栋请求永不发出 → 永久死锁在「无目标」，审核员看不到任何楼栋。
 *
 * 修复：``buildingsLoaded`` 门禁 —— 首次加载完成前一律 ``unknown``。
 *
 * ⚠️ 本文件是**防回归护栏**，请勿因「测试太细」而删除。
 */

import { ReviewTargetPicker, type MergeAvailability } from "./review-target-picker";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  client: { GET: getMock },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const baseProps = {
  kind: "building" as const,
  communityId: "c-1",
  communityName: "金杨七街坊",
  actionLabel: "merge" as const,
  selection: { community: null, building: null, room: null },
  onSelectionChange: vi.fn(),
};

/** 收集 availability 上报序列 */
function collect(): { values: MergeAvailability[]; cb: (v: MergeAvailability) => void } {
  const values: MergeAvailability[] = [];
  return { values, cb: (v: MergeAvailability) => values.push(v) };
}

beforeEach(() => {
  getMock.mockReset();
});

describe("ReviewTargetPicker · 初始态不得上报 empty（防死锁）", () => {
  it("首次加载未完成（请求挂起）→ 只上报 unknown，绝不上报 empty", async () => {
    // 让楼栋请求永不 resolve，模拟「首帧 / 加载中」
    getMock.mockReturnValue(new Promise(() => {}));
    const { values, cb } = collect();

    render(<ReviewTargetPicker {...baseProps} onAvailabilityChange={cb} />);

    await waitFor(() => expect(values.length).toBeGreaterThan(0));
    expect(values).not.toContain("empty");
    expect(values.every((v) => v === "unknown")).toBe(true);
  });

  it("加载完成且楼栋为空 → 才允许上报 empty", async () => {
    getMock.mockResolvedValue({ data: { total: 0, items: [] }, error: undefined });
    const { values, cb } = collect();

    render(<ReviewTargetPicker {...baseProps} onAvailabilityChange={cb} />);

    await waitFor(() => expect(values).toContain("empty"));
    // 且 unknown 一定先于 empty（证明有门禁，不是首帧就报）
    expect(values.indexOf("unknown")).toBeLessThan(values.indexOf("empty"));
  });

  it("加载完成且有实表楼栋 → 上报 available", async () => {
    getMock.mockResolvedValue({
      data: {
        total: 1,
        items: [{ id: 5, building_no: "8号楼", pending: false, pending_id: null }],
      },
      error: undefined,
    });
    const { values, cb } = collect();

    render(<ReviewTargetPicker {...baseProps} onAvailabilityChange={cb} />);

    await waitFor(() => expect(values).toContain("available"));
    expect(values).not.toContain("empty");
  });

  it("加载完成但只有待审楼栋 → 仍算 available（BR-29 放行待审兄弟）", async () => {
    getMock.mockResolvedValue({
      data: {
        total: 0,
        items: [{ id: 0, building_no: "9号楼", pending: true, pending_id: 77 }],
      },
      error: undefined,
    });
    const { values, cb } = collect();

    render(<ReviewTargetPicker {...baseProps} onAvailabilityChange={cb} />);

    await waitFor(() => expect(values).toContain("available"));
    expect(values).not.toContain("empty");
  });

  it("归属小区缺失（父楼栋已删除）→ empty（无路可走，需引导改用新增/驳回）", async () => {
    const { values, cb } = collect();

    render(
      <ReviewTargetPicker {...baseProps} communityId={null} onAvailabilityChange={cb} />,
    );

    await waitFor(() => expect(values).toContain("empty"));
    expect(getMock).not.toHaveBeenCalled();
  });

  it("请求失败 → 置位 loaded 后如实上报 empty（不永久卡在 unknown）", async () => {
    getMock.mockResolvedValue({ data: undefined, error: { message: "boom" } });
    const { values, cb } = collect();

    render(<ReviewTargetPicker {...baseProps} onAvailabilityChange={cb} />);

    await waitFor(() => expect(values).toContain("empty"));
  });

  it("户室条目不预选楼栋时不上报 available（还不知道有无户室）", async () => {
    getMock.mockResolvedValue({
      data: {
        total: 1,
        items: [{ id: 5, building_no: "8号楼", pending: false, pending_id: null }],
      },
      error: undefined,
    });
    const { values, cb } = collect();

    render(<ReviewTargetPicker {...baseProps} kind="room" onAvailabilityChange={cb} />);

    await waitFor(() => expect(values.length).toBeGreaterThan(0));
    // 有楼栋但尚未选楼栋 → 只能是 unknown（不能误报 available，否则审核员会以为能提交）
    expect(values).not.toContain("available");
  });
});

describe("ReviewTargetPicker · 待审兄弟条目的可选性（BR-29）", () => {
  const pendingBuildingResponse = {
    data: {
      total: 0,
      items: [{ id: 0, building_no: "9号楼", pending: true, pending_id: 77 }],
    },
    error: undefined,
  };

  it("allowPendingTargets=true（merge）→ 待审楼栋 chip 可选", async () => {
    getMock.mockResolvedValue(pendingBuildingResponse);
    const { container } = render(<ReviewTargetPicker {...baseProps} allowPendingTargets />);

    await waitFor(() => {
      const chips = Array.from(container.querySelectorAll("button")).filter((b) =>
        (b.textContent ?? "").includes("9号楼"),
      );
      expect(chips.length).toBeGreaterThan(0);
      expect(chips[0]).not.toBeDisabled();
      expect(chips[0].textContent).toContain("待审");
    });
  });

  it("allowPendingTargets=false（reject）→ 待审楼栋 chip 禁用", async () => {
    getMock.mockResolvedValue(pendingBuildingResponse);
    const { container } = render(
      <ReviewTargetPicker {...baseProps} allowPendingTargets={false} />,
    );

    await waitFor(() => {
      const chips = Array.from(container.querySelectorAll("button")).filter((b) =>
        (b.textContent ?? "").includes("9号楼"),
      );
      expect(chips.length).toBeGreaterThan(0);
      expect(chips[0]).toBeDisabled();
    });
  });
});
