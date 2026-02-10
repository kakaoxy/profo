import * as React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { MiniProjectForm } from "./mini-project-form";

describe("MiniProjectForm", () => {
  test("view 模式不显示可编辑输入框", () => {
    render(
      <MiniProjectForm
        mode="view"
        consultants={[]}
        initialProject={{
          id: "p1",
          project_id: null,
          title: "t",
          cover_image: null,
          style: null,
          description: null,
          marketing_tags: [],
          share_title: null,
          share_image: null,
          consultant_id: null,
          address: null,
          area: null,
          price: null,
          layout: null,
          orientation: null,
          floor_info: null,
          view_count: 0,
          sort_order: 0,
          is_published: false,
          published_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          consultant: null,
        }}
      />,
    );

    expect(screen.getAllByText("t").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("textbox", { name: /标题/i }),
    ).not.toBeInTheDocument();
  });

  test("create 模式显示可编辑输入框", async () => {
    const user = userEvent.setup();
    render(<MiniProjectForm mode="create" consultants={[]} />);

    const titleInput = screen.getByRole("textbox", { name: "营销标题" });
    expect(titleInput).toBeEnabled();

    await user.type(titleInput, "A");
    expect(titleInput).toHaveValue("A");

    expect(screen.getByRole("button", { name: "创建项目" })).toBeEnabled();
  });

  test("create 模式提交时不把 sort_order/is_published 放进 create body，并进行二次更新", async () => {
    const user = userEvent.setup();

    const createMiniProject = vi.fn(async () => ({
      success: true,
      data: {
        id: "p-new",
        project_id: null,
        title: "t",
        cover_image: null,
        style: null,
        description: null,
        marketing_tags: [],
        share_title: null,
        share_image: null,
        consultant_id: null,
        address: null,
        area: null,
        price: null,
        layout: null,
        orientation: null,
        floor_info: null,
        view_count: 0,
        sort_order: 0,
        is_published: false,
        published_at: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        consultant: null,
      },
    }));
    const updateMiniProject = vi.fn(async () => ({ success: true }));

    render(
      <MiniProjectForm
        mode="create"
        consultants={[]}
        actions={{ createMiniProject, updateMiniProject }}
      />,
    );

    await user.type(screen.getByRole("textbox", { name: "营销标题" }), "t");
    await user.clear(screen.getByRole("spinbutton", { name: "排序权重" }));
    await user.type(screen.getByRole("spinbutton", { name: "排序权重" }), "3");
    await user.click(screen.getByRole("switch", { name: "发布" }));
    await user.click(screen.getByRole("button", { name: "创建项目" }));

    expect(createMiniProject).toHaveBeenCalledTimes(1);
    expect(createMiniProject.mock.calls[0]?.[0]).toMatchObject({ title: "t" });
    expect(createMiniProject.mock.calls[0]?.[0]).not.toHaveProperty(
      "sort_order",
    );
    expect(createMiniProject.mock.calls[0]?.[0]).not.toHaveProperty(
      "is_published",
    );

    expect(updateMiniProject).toHaveBeenCalledWith("p-new", {
      is_published: true,
      sort_order: 3,
    });
  });

  test("edit 模式仅提交 dirty 字段", async () => {
    const user = userEvent.setup();

    const updateMiniProject = vi.fn(async () => ({ success: true }));

    render(
      <MiniProjectForm
        mode="edit"
        consultants={[]}
        initialProject={{
          id: "p1",
          project_id: null,
          title: "old",
          cover_image: null,
          style: null,
          description: null,
          marketing_tags: [],
          share_title: null,
          share_image: null,
          consultant_id: null,
          address: null,
          area: null,
          price: null,
          layout: null,
          orientation: null,
          floor_info: null,
          view_count: 0,
          sort_order: 0,
          is_published: false,
          published_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          consultant: null,
        }}
        actions={{
          createMiniProject: vi.fn(),
          updateMiniProject,
        }}
      />,
    );

    const titleInput = screen.getByRole("textbox", { name: "营销标题" });
    await user.clear(titleInput);
    await user.type(titleInput, "new");
    await user.click(screen.getByRole("button", { name: "保存更改" }));

    expect(updateMiniProject).toHaveBeenCalledTimes(1);
    expect(updateMiniProject.mock.calls[0]?.[0]).toBe("p1");
    expect(updateMiniProject.mock.calls[0]?.[1]).toEqual({ title: "new" });
  });
});
