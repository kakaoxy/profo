import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { AttachmentInfo } from "../types";
import { useProjectAttachments } from "./use-project-attachments";

// Mock sonner toast so it doesn't leak into jsdom
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const makeAtt = (url: string, filename?: string): AttachmentInfo => ({
  filename: filename || url.split("/").pop() || "unknown",
  url,
  category: "other",
  fileType: "other",
  size: 100,
});

const A = makeAtt("https://ex.com/a.pdf", "a.pdf");
const B = makeAtt("https://ex.com/b.pdf", "b.pdf");
const C = makeAtt("https://ex.com/c.pdf", "c.pdf");

/** 获取 onUpdateAttachments 最后一次调用的 URL 列表 */
function lastCallUrls(spy: ReturnType<typeof vi.fn>): string[] {
  const lastCall = spy.mock.lastCall;
  if (!lastCall) return [];
  return (lastCall[0] as AttachmentInfo[]).map((a) => a.url);
}

describe("useProjectAttachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("attachments derivation", () => {
    it("从数组型 signingMaterials 派生附件列表", () => {
      const signingMaterials = [A, B];
      const { result } = renderHook(() =>
        useProjectAttachments({ signingMaterials }),
      );
      expect(result.current.attachments).toHaveLength(2);
      expect(result.current.attachments[0].url).toBe(A.url);
    });

    it("signingMaterials 为空时返回空数组", () => {
      const { result } = renderHook(() =>
        useProjectAttachments({ signingMaterials: null }),
      );
      expect(result.current.attachments).toEqual([]);
    });
  });

  describe("连续删除不复活已删附件（regression: 89396bf）", () => {
    it("连续删除 A 和 B 后，onUpdateAttachments 收到 [C] 而非 [A, C]", async () => {
      const onUpdateAttachments = vi.fn();
      // 使用 initialProps 保持 signingMaterials 引用稳定
      // （inline 数组字面量在每次 render 会创建新引用，触发 useEffect 重置 override）
      const { result } = renderHook(
        ({ signingMaterials }) =>
          useProjectAttachments({ signingMaterials, onUpdateAttachments }),
        { initialProps: { signingMaterials: [A, B, C] } },
      );

      // 初始：[A, B, C]
      expect(result.current.attachments.map((a) => a.url)).toEqual([
        A.url,
        B.url,
        C.url,
      ]);

      // 删除 A
      await act(async () => {
        const onDelete = result.current.createHandlers(() => {}).onDelete;
        onDelete?.(A.url);
      });
      expect(onUpdateAttachments).toHaveBeenCalledTimes(1);
      expect(lastCallUrls(onUpdateAttachments)).toEqual([B.url, C.url]);

      // 删除 B —— 修复前会用 stale 的 [A, B, C] 过滤，得到 [A, C]（A 复活）
      await act(async () => {
        const onDelete = result.current.createHandlers(() => {}).onDelete;
        onDelete?.(B.url);
      });
      expect(onUpdateAttachments).toHaveBeenCalledTimes(2);
      // 第二次保存应该只有 [C]，绝不能包含 A 或 B
      expect(lastCallUrls(onUpdateAttachments)).toEqual([C.url]);
    });
  });

  describe("连续上传不丢失先上传的附件（regression: 89396bf）", () => {
    it("连续上传 D 和 E 后，onUpdateAttachments 收到 [A, D, E]", async () => {
      const onUpdateAttachments = vi.fn();
      const { result } = renderHook(
        ({ signingMaterials }) =>
          useProjectAttachments({ signingMaterials, onUpdateAttachments }),
        { initialProps: { signingMaterials: [A] } },
      );

      const D = makeAtt("https://ex.com/d.pdf", "d.pdf");
      const E = makeAtt("https://ex.com/e.pdf", "e.pdf");

      // 上传 D
      await act(async () => {
        result.current.onUpload(D);
      });
      expect(onUpdateAttachments).toHaveBeenCalledTimes(1);
      expect(lastCallUrls(onUpdateAttachments)).toEqual([A.url, D.url]);

      // 上传 E —— 修复前会用 stale 的 [A] 拼接，得到 [A, E]（D 丢失）
      await act(async () => {
        result.current.onUpload(E);
      });
      expect(onUpdateAttachments).toHaveBeenCalledTimes(2);
      expect(lastCallUrls(onUpdateAttachments)).toEqual([
        A.url,
        D.url,
        E.url,
      ]);
    });
  });

  describe("signingMaterials 引用变化时重置 override", () => {
    it("父组件刷新后 override 重置，attachments 以新 signingMaterials 为准", async () => {
      const onUpdateAttachments = vi.fn();
      const { result, rerender } = renderHook(
        ({ signingMaterials }) =>
          useProjectAttachments({ signingMaterials, onUpdateAttachments }),
        { initialProps: { signingMaterials: [A, B, C] } },
      );

      // 删除 A → override = [B, C]
      await act(async () => {
        const onDelete = result.current.createHandlers(() => {}).onDelete;
        onDelete?.(A.url);
      });
      expect(result.current.attachments.map((a) => a.url)).toEqual([
        B.url,
        C.url,
      ]);

      // 父组件刷新：传入新的 signingMaterials 引用（模拟后端返回最新数据 [B, C]）
      rerender({ signingMaterials: [B, C] });

      // override 应被重置，attachments 以新 signingMaterials 为准
      expect(result.current.attachments.map((a) => a.url)).toEqual([
        B.url,
        C.url,
      ]);

      // 再次删除 B 应基于 [B, C] 而非 stale 数据
      await act(async () => {
        const onDelete = result.current.createHandlers(() => {}).onDelete;
        onDelete?.(B.url);
      });
      expect(lastCallUrls(onUpdateAttachments)).toEqual([C.url]);
    });
  });

  describe("删除后上传", () => {
    it("删除 A 后上传 D，结果为 [B, C, D]", async () => {
      const onUpdateAttachments = vi.fn();
      const { result } = renderHook(
        ({ signingMaterials }) =>
          useProjectAttachments({ signingMaterials, onUpdateAttachments }),
        { initialProps: { signingMaterials: [A, B, C] } },
      );

      // 删除 A
      await act(async () => {
        const onDelete = result.current.createHandlers(() => {}).onDelete;
        onDelete?.(A.url);
      });

      // 上传 D
      const D = makeAtt("https://ex.com/d.pdf", "d.pdf");
      await act(async () => {
        result.current.onUpload(D);
      });

      expect(lastCallUrls(onUpdateAttachments)).toEqual([
        B.url,
        C.url,
        D.url,
      ]);
    });
  });

  describe("无 onUpdateAttachments 时", () => {
    it("onDelete 为 undefined", () => {
      const { result } = renderHook(() =>
        useProjectAttachments({ signingMaterials: [A] }),
      );
      const handlers = result.current.createHandlers(() => {});
      expect(handlers.onDelete).toBeUndefined();
    });

    it("onUpload 调用时不抛错，不调用 onUpdateAttachments", () => {
      const { result } = renderHook(() =>
        useProjectAttachments({ signingMaterials: [A] }),
      );
      expect(() => {
        act(() => result.current.onUpload(B));
      }).not.toThrow();
    });
  });
});
