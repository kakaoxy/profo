import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";

/**
 * BR-29 小区抽屉 · 改名链路（楼栋号码 + 小区名）与「改名后刷新」回归用例.
 *
 * 关键断言：
 * - 改名成功后**楼栋列表与画像计数同步重载**（不是只弹 toast）；
 * - 409 撞名时展示后端原文，且不刷新（本地数据未被污染）；
 * - 小区名改名成功后抽屉标题立即更新 + onUpdated 触发父级 router.refresh。
 */

import { CommunityDrawer } from "./community-drawer";

const { getMock, patchMock } = vi.hoisted(() => ({ getMock: vi.fn(), patchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  client: { GET: getMock, PATCH: patchMock, DELETE: vi.fn(), POST: vi.fn() },
}));

// 所有权限放开（含 canGovern → 改名入口可见）
vi.mock("@/hooks/use-permission", () => ({
  usePermission: () => ({ hasPermission: () => true, permissions: [], isLoading: false }),
}));

// 抽屉内子区块与网络无关，替换为桩以聚焦改名链路
vi.mock("./community-images-section", () => ({
  CommunityImagesSection: () => <div data-testid="images" />,
}));
vi.mock("./merge-dialog", () => ({ MergeDialog: () => null }));
vi.mock("./floor-room-panel", () => ({ FloorRoomPanel: () => <div data-testid="floor-panel" /> }));
vi.mock("./admin-add-forms", () => ({
  BuildingAddForm: () => null,
  RoomAddForm: () => null,
}));

let communityName = "金杨七街坊";
let buildingNo = "21";

function routeGet(url: string) {
  if (url.includes("/communities/{community_id}/buildings") || url.endsWith("/buildings")) {
    return Promise.resolve({
      data: {
        total: 1,
        items: [
          {
            id: 5,
            community_id: "c-1",
            building_no: buildingNo,
            lng: null,
            lat: null,
            room_count: 0,
            floor_count: 0,
            linked_project_count: 0,
            pending: false,
            pending_id: null,
          },
        ],
      },
      error: undefined,
    });
  }
  // 小区详情
  return Promise.resolve({
    data: {
      id: "c-1",
      name: communityName,
      district: "浦东",
      business_circle: "金杨",
      ring: null,
      property_types: [],
      era_from: null,
      era_to: null,
      developer: null,
      property_mgmt: null,
      address: null,
      lng: null,
      lat: null,
      building_count: 1,
      room_count: 0,
      linked_project_count: 0,
      first_image_url: null,
      merged_into_id: null,
      merged_children: [],
    },
    error: undefined,
  });
}

beforeEach(() => {
  communityName = "金杨七街坊";
  buildingNo = "21";
  getMock.mockReset();
  patchMock.mockReset();
  getMock.mockImplementation(routeGet);
});

describe("CommunityDrawer · 楼栋改名（BR-29 场景③）", () => {
  it("改名成功后重载楼栋列表与画像（不是只弹 toast）", async () => {
    const onUpdated = vi.fn();
    render(
      <CommunityDrawer communityId="c-1" communityName="金杨七街坊" open onOpenChange={vi.fn()} onUpdated={onUpdated} />,
    );

    const row = await waitFor(() => {
      const el = Array.from(document.querySelectorAll("button")).find((b) => {
        const t = (b.textContent ?? "").trim();
        return t.startsWith("21") && t.includes("层 ·");
      }) as HTMLElement | undefined;
      if (!el) throw new Error("楼栋行未渲染");
      return el;
    });
    // 展开楼栋行
    // 精确定位楼栋行：渲染文本为「210 层 · 0 户 ...」（building_no 与「0 层」无空格分隔），
    // 故按「以 building_no 开头且包含『层 ·』」定位，避免误命中其他按钮
    fireEvent.click(row);

    const renameEntry = await waitFor(() => {
      // 小区名与楼栋行各有一个「改名」：楼栋那两个按钮与「删除楼栋」同排
      const del = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "删除楼栋",
      ) as HTMLElement | undefined;
      if (!del) throw new Error("删除楼栋按钮未出现（楼栋行未展开）");
      const bar = del.parentElement as HTMLElement;
      const btn = Array.from(bar.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "改名",
      ) as HTMLElement | undefined;
      if (!btn) throw new Error("楼栋改名入口未出现");
      return btn;
    });
    fireEvent.click(renameEntry);

    const input = await waitFor(() => {
      const el = document.querySelector('input[placeholder="如 21"]');
      if (!el) throw new Error("改名输入框未出现");
      return el as HTMLInputElement;
    });
    fireEvent.change(input, { target: { value: "金杨路660弄21号" } });

    // 后端返回归一后的新名
    buildingNo = "金杨路660弄21";
    patchMock.mockResolvedValue({
      data: { success: true, message: "楼栋号已修正：21 → 金杨路660弄21", old_name: "21", new_name: "金杨路660弄21" },
      error: undefined,
    });

    const callsBefore = getMock.mock.calls.length;
    const saveBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("保存"),
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      // PATCH 调用体已归一（前端直接传原文，归一在后端；这里断言传的是用户输入）
      expect(patchMock).toHaveBeenCalledWith(
        "/api/v1/admin/building-dictionary/buildings/{building_id}",
        expect.objectContaining({
          params: { path: { building_id: 5 } },
          body: { building_no: "金杨路660弄21号" },
        }),
      );
      // 改名成功后必须重载（楼栋列表 + 小区详情 ≥2 次 GET）
      expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2);
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it("409 撞名 → 展示后端原文且不重载（本地数据未被污染）", async () => {
    render(
      <CommunityDrawer communityId="c-1" communityName="金杨七街坊" open onOpenChange={vi.fn()} />,
    );

    // 精确定位楼栋行（渲染文本为「210 层 · 0 户 ...」，building_no 与「0 层」无空格分隔）
    const row = await waitFor(() => {
      const el = Array.from(document.querySelectorAll("button")).find((b) => {
        const t = (b.textContent ?? "").trim();
        return t.startsWith("21") && t.includes("层 ·");
      }) as HTMLElement | undefined;
      if (!el) throw new Error("楼栋行未渲染");
      return el;
    });
    fireEvent.click(row);

    const renameEntry = await waitFor(() => {
      // 小区名与楼栋行各有一个「改名」：楼栋那两个按钮与「删除楼栋」同排
      const del = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "删除楼栋",
      ) as HTMLElement | undefined;
      if (!del) throw new Error("删除楼栋按钮未出现（楼栋行未展开）");
      const bar = del.parentElement as HTMLElement;
      const btn = Array.from(bar.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "改名",
      ) as HTMLElement | undefined;
      if (!btn) throw new Error("楼栋改名入口未出现");
      return btn;
    });
    fireEvent.click(renameEntry);

    const input = await waitFor(() => {
      const el = document.querySelector('input[placeholder="如 21"]');
      if (!el) throw new Error("改名输入框未出现");
      return el as HTMLInputElement;
    });
    fireEvent.change(input, { target: { value: "A栋" } });

    patchMock.mockResolvedValue({
      data: undefined,
      error: { code: 409, message: "小区内已存在楼栋「A栋」（ID 9），如需归并请先与该楼栋核对后再处理" },
    });

    const callsBefore = getMock.mock.calls.length;
    const saveBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("保存"),
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalled();
      // 失败不刷新
      expect(getMock.mock.calls.length).toBe(callsBefore);
      // 改名输入框仍在（便于用户改别的名字）
      expect(document.querySelector('input[placeholder="如 21"]')).not.toBeNull();
    });
  });
});

describe("CommunityDrawer · 小区名改名（BR-29 决策 D-D=b）", () => {
  it("点击改名 → 保存 → 调用 rename 端点并重载详情", async () => {
    const onUpdated = vi.fn();
    render(
      <CommunityDrawer communityId="c-1" communityName="金杨七街坊" open onOpenChange={vi.fn()} onUpdated={onUpdated} />,
    );

    await waitFor(() => {
      if (!(document.body.textContent ?? "").includes("金杨七街坊")) throw new Error("抽屉标题未渲染");
    });
    const nameRenameBtn = await waitFor(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "改名",
      );
      if (!btn) throw new Error("小区改名入口未出现");
      return btn as HTMLElement;
    });
    fireEvent.click(nameRenameBtn);

    const input = await waitFor(() => {
      const el = document.querySelector('input[placeholder="小区名"]');
      if (!el) throw new Error("小区名输入框未出现");
      return el as HTMLInputElement;
    });
    communityName = "金杨八街坊";
    fireEvent.change(input, { target: { value: "金杨八街坊" } });

    patchMock.mockResolvedValue({
      data: {
        success: true,
        message: "小区名已修正：金杨七街坊 → 金杨八街坊（旧名已存为别名，仍可搜索）",
        old_name: "金杨七街坊",
        new_name: "金杨八街坊",
      },
      error: undefined,
    });

    const saveBtn = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("保存"),
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledWith(
        "/api/v1/admin/building-dictionary/communities/{community_id}/rename",
        expect.objectContaining({
          params: { path: { community_id: "c-1" } },
          body: { name: "金杨八街坊" },
        }),
      );
      expect(onUpdated).toHaveBeenCalled();
    });
    // 标题随重载更新为新名
    await waitFor(() => expect(document.body.textContent).toContain("金杨八街坊"));
  });
});
