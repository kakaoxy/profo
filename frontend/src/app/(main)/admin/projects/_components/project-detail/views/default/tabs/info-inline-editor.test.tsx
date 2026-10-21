import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { Project } from "../../../../../types";

// ─── Mocks ───────────────────────────────────────────────────────────────────
const {
  mockUpdateProjectAction,
  mockGetOwnerBankCardAction,
  mockGetSalesUsersSimpleAction,
  mockSyncCommunityDistrict,
} = vi.hoisted(() => ({
  mockUpdateProjectAction: vi.fn(),
  mockGetOwnerBankCardAction: vi.fn(),
  mockGetSalesUsersSimpleAction: vi.fn(),
  mockSyncCommunityDistrict: vi.fn(),
}));

vi.mock("../../../../../actions/core", () => ({
  updateProjectAction: mockUpdateProjectAction,
  getOwnerBankCardAction: mockGetOwnerBankCardAction,
}));

vi.mock("../../../../../actions/sales", () => ({
  getSalesUsersSimpleAction: mockGetSalesUsersSimpleAction,
}));

vi.mock("../../../../../_components/create-project/utils", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../_components/create-project/utils")
  >("../../../../../_components/create-project/utils");
  return { ...actual, syncCommunityDistrict: mockSyncCommunityDistrict };
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn(), dismiss: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

/**
 * 小区/地址已改走共享四级选择器（DictAddressPicker），旧的 CommunitySelect mock
 * 从 f6e5d6a5 起即失效。这里替换为轻量桩：本用例只关心「项目负责人」下拉与保存
 * payload，字典选择器不应引入第二个 combobox（曾导致 getByRole("combobox") 歧义）。
 *
 * ⚠️ 不要删除该 mock：真实 DictAddressPicker 内部含社区搜索 Popover（role=combobox），
 * 不桩掉会让 `getByRole("combobox")` 命中 2 个元素。
 */
vi.mock("@/components/dict-address-picker", () => ({
  DictAddressPicker: ({ value }: { value?: { communityName?: string } | null }) => (
    <div data-testid="dict-address-picker">{value?.communityName ?? ""}</div>
  ),
}));

// FloorInput 单独桩（@/components/common 还有其他导出，整体 mock 会漏掉真实依赖）
vi.mock("@/components/common", () => ({
  FloorInput: ({ value }: { value: string }) => (
    <input data-testid="floor-input" defaultValue={value} />
  ),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────
function makeProject(): Project {
  return {
    id: "p1",
    name: "翠湖天地 · 张宅",
    status: "signing",
    community_id: "c1",
    community_name: "翠湖天地",
    address: "浦东新区锦绣路 3001 弄 12 号",
    area: 89,
    layout: "2室1厅1卫",
    orientation: "南北",
    floor_info: "6/18层",
    business_form: "agent",
    contract_no: "HT-2026-0812",
    signing_price: 318,
    project_manager: { id: "u-admin", nickname: "系统管理员", avatar: null, username: "admin" },
    owners: [{ id: "o1", owner_name: "张伟", owner_phone: "13800006677", relation_type: "业主" }],
    created_at: "2026-08-12T00:00:00Z",
    updated_at: "2026-08-12T00:00:00Z",
  } as unknown as Project;
}

function renderEditor(overrides?: { usersById?: Map<string, string> }) {
  const usersById =
    overrides?.usersById ??
    new Map([
      ["u-admin", "系统管理员"],
      ["u1", "测试用户"],
    ]);
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  render(
    <InfoInlineEditorStub
      project={makeProject()}
      usersById={usersById}
      onCancel={onCancel}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onCancel };
}

/**
 * 精确定位「项目负责人」下拉触发器。
 *
 * 为什么不能直接用 ``getByRole("combobox")``：表单里还存在小区搜索等其它 combobox，
 * 一旦有人新增下拉，整组用例会因歧义失败（历史上正是这样坏的）。改为按
 * ``FormLabel`` 文本定位其所属 FormItem 内的 combobox，语义稳定。
 */
function getProjectManagerSelect(): HTMLElement {
  const label = screen.getByText("项目负责人");
  // FormLabel → FormItem（含 label + control + message）
  const item = label.closest('[data-slot="form-item"]') ?? label.parentElement?.parentElement;
  const box = item?.querySelector<HTMLElement>('[role="combobox"]');
  if (!box) throw new Error("未找到「项目负责人」下拉");
  return box;
}

// 用动态 import 拿真实组件（避免 ESM hoist 与 mock 顺序问题）
import { InfoInlineEditor as InfoInlineEditorStub } from "./info-inline-editor";

// jsdom 缺 Pointer Capture / scrollIntoView（Radix Select 依赖），测试环境补齐
beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

describe("InfoInlineEditor - 项目负责人保存链路", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProjectAction.mockResolvedValue({ success: true });
    mockGetOwnerBankCardAction.mockResolvedValue({ success: true, data: null });
    mockGetSalesUsersSimpleAction.mockResolvedValue({ success: true, data: [] });
    mockSyncCommunityDistrict.mockResolvedValue({ success: true });
  });

  it("usersById 有数据时下拉展示用户选项，选择新负责人后保存 payload 携带新 id", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderEditor();

    // 打开项目负责人下拉并选择「测试用户」
    const combobox = getProjectManagerSelect();
    await user.click(combobox);
    const option = await screen.findByRole("option", { name: "测试用户" });
    await user.click(option);

    // 点击保存（form submit）
    await user.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(mockUpdateProjectAction).toHaveBeenCalled();
    });
    const [projectId, payload] = mockUpdateProjectAction.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(projectId).toBe("p1");
    expect(payload.project_manager_id).toBe("u1");
    expect(onSaved).toHaveBeenCalled();
  });

  it("usersById 为空时自行加载用户列表兜底，下拉仍可选人", async () => {
    mockGetSalesUsersSimpleAction.mockResolvedValue({
      success: true,
      data: [
        { id: "u1", nickname: "测试用户", username: "testuser" },
        { id: "u-admin", nickname: "系统管理员", username: "admin" },
      ],
    });
    const user = userEvent.setup();
    renderEditor({ usersById: new Map() });

    await waitFor(() => {
      expect(mockGetSalesUsersSimpleAction).toHaveBeenCalled();
    });
    const combobox = getProjectManagerSelect();
    await user.click(combobox);
    const option = await screen.findByRole("option", { name: "测试用户" });
    expect(option).toBeTruthy();
  });
});
