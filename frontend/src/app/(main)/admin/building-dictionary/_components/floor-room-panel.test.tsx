import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * BR-29 户室网格 · 改名入口与「楼层分组重载」回归用例.
 *
 * 关键点：户室改名会改变派生列 ``floor``（0401→0501 从 4 层跳到 5 层），
 * 因此**必须在父级触发重载**而不是本地替换 —— 否则该户会留在旧的楼层分组里
 * （运营看到的「改名后户室跑错层」静默脏数据）。本用例断言 onRenameRoom 回调
 * 被正确触发且携带原始 roomNo，刷新由父级负责。
 */

import { FloorRoomPanel } from "./floor-room-panel";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({ client: { GET: getMock } }));

const floorsResponse = {
  data: [
    { floor: 4, room_count: 2, has_pending: false },
    { floor: 5, room_count: 0, has_pending: false },
  ],
  error: undefined,
};

const detailResponse = {
  data: {
    id: 1,
    community_id: "c-1",
    building_no: "1",
    lng: null,
    lat: null,
    room_count: 2,
    floor_count: 2,
    linked_project_count: 0,
    pending: false,
    pending_id: null,
    room_total: 2,
    room_page: 1,
    room_has_more: false,
    rooms: [
      { id: 11, room_no: "0401", floor: 4, plate_no: "401", pending: false, pending_id: null },
      { id: 12, room_no: "0402", floor: 4, plate_no: "402", pending: false, pending_id: null },
    ],
  },
  error: undefined,
};

function routeGet(url: string) {
  if (url.includes("/floors")) return Promise.resolve(floorsResponse);
  return Promise.resolve(detailResponse);
}

beforeEach(() => {
  getMock.mockReset();
  getMock.mockImplementation(routeGet);
});

describe("FloorRoomPanel · 户室改名入口（BR-29）", () => {
  it("未传 onRenameRoom 时不渲染改名入口（权限/场景收口）", async () => {
    const { container } = render(<FloorRoomPanel buildingId={1} />);
    await waitFor(() => expect(container.textContent).toContain("0401"));

    // 选中户室后也不应出现改名按钮
    await userEvent.click(container.querySelector("button[class*='font-mono'][class*='text-[10px]']") as HTMLElement);
    await waitFor(() => expect(container.textContent).not.toContain("改名所选户室"));
  });

  it("选中户室后出现改名入口，点击回调携带 roomId 与原始 roomNo", async () => {
    const onRenameRoom = vi.fn();
    const { container } = render(<FloorRoomPanel buildingId={1} onRenameRoom={onRenameRoom} />);

    // 等户室网格渲染（楼层默认展开前两层）
    const roomBtn = await waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "0401",
      );
      if (!btn) throw new Error("0401 未渲染");
      return btn as HTMLElement;
    });
    await userEvent.click(roomBtn);

    const renameBtn = await waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find((b) =>
        (b.textContent ?? "").includes("改名所选户室 0401"),
      );
      if (!btn) throw new Error("改名入口未出现");
      return btn as HTMLElement;
    });
    await userEvent.click(renameBtn);

    // 断言回调参数：父级需据此发起 PATCH 并重载（楼层可能变化）
    expect(onRenameRoom).toHaveBeenCalledWith(11, "0401");
  });

  it("改名与删除入口同时存在且互不影响（admin 两个动作并列）", async () => {
    const onRenameRoom = vi.fn();
    const onDeleteRoom = vi.fn();
    const { container } = render(
      <FloorRoomPanel buildingId={1} onRenameRoom={onRenameRoom} onDeleteRoom={onDeleteRoom} />,
    );

    const roomBtn = await waitFor(() => {
      const btn = Array.from(container.querySelectorAll("button")).find(
        (b) => (b.textContent ?? "").trim() === "0401",
      );
      if (!btn) throw new Error("0401 未渲染");
      return btn as HTMLElement;
    });
    await userEvent.click(roomBtn);

    await waitFor(() => {
      const txt = container.textContent ?? "";
      expect(txt).toContain("改名所选户室 0401");
      expect(txt).toContain("删除所选户室 0401");
    });

    const deleteBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("删除所选户室"),
    ) as HTMLElement;
    await userEvent.click(deleteBtn);
    expect(onDeleteRoom).toHaveBeenCalledWith(11, "0401");
    expect(onRenameRoom).not.toHaveBeenCalled();
  });
});
