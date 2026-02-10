import { beforeEach, describe, expect, test, vi } from "vitest";

import type { MiniProjectCreate, MiniProjectUpdate } from "./types";

const mocks = vi.hoisted(() => ({
  fetchClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/api-server", () => ({
  fetchClient: mocks.fetchClient,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

import { createMiniProjectAction, updateMiniProjectAction } from "./actions";

describe("minipro projects server actions", () => {
  beforeEach(() => {
    mocks.fetchClient.mockReset();
    mocks.revalidatePath.mockReset();
  });

  test("createMiniProjectAction 使用正确路径并触发列表 revalidate", async () => {
    const postMock = vi.fn(async () => ({ data: { id: "p1" }, error: null }));
    mocks.fetchClient.mockResolvedValue({ POST: postMock });

    const body: MiniProjectCreate = {
      title: "t",
      cover_image: null,
      style: null,
      description: null,
      marketing_tags: [],
      share_title: null,
      share_image: null,
      consultant_id: null,
    };

    const result = await createMiniProjectAction(body);

    expect(result.success).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/api/v1/admin/mini/projects", {
      body,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/minipro/projects");
  });

  test("updateMiniProjectAction 使用正确路径并触发详情+列表 revalidate", async () => {
    const putMock = vi.fn(async () => ({ data: { id: "p1" }, error: null }));
    mocks.fetchClient.mockResolvedValue({ PUT: putMock });

    const patch: MiniProjectUpdate = { title: "new" };
    const result = await updateMiniProjectAction("p1", patch);

    expect(result.success).toBe(true);
    expect(putMock).toHaveBeenCalledWith("/api/v1/admin/mini/projects/{id}", {
      params: { path: { id: "p1" } },
      body: patch,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/minipro/projects/p1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/minipro/projects");
  });
});
