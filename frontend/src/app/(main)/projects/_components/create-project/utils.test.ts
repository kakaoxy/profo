import { describe, expect, it, vi } from "vitest";
import {
  toDateStr,
  fromDateStr,
  parseLayout,
  buildLayout,
  convertAttachments,
} from "./utils";

describe("create-project/utils", () => {
  // ─── toDateStr ───────────────────────────────────────────
  describe("toDateStr", () => {
    it("正常日期转 YYYY-MM-DD", () => {
      const d = new Date(2025, 5, 9); // 2025-06-09（月份从0开始）
      expect(toDateStr(d)).toBe("2025-06-09");
    });

    it("月份和日期补零", () => {
      const d = new Date(2025, 0, 3); // 2025-01-03
      expect(toDateStr(d)).toBe("2025-01-03");
    });

    it("null 输入返回 null", () => {
      expect(toDateStr(null)).toBeNull();
    });

    it("undefined 输入返回 null", () => {
      expect(toDateStr(undefined)).toBeNull();
    });
  });

  // ─── fromDateStr ─────────────────────────────────────────
  describe("fromDateStr", () => {
    it("正常字符串转 Date", () => {
      const d = fromDateStr("2025-06-09");
      expect(d).toBeInstanceOf(Date);
      expect(d!.getFullYear()).toBe(2025);
      expect(d!.getMonth()).toBe(5); // 6月=5
      expect(d!.getDate()).toBe(9);
    });

    it("空字符串返回 undefined", () => {
      expect(fromDateStr("")).toBeUndefined();
    });

    it("null 返回 undefined", () => {
      expect(fromDateStr(null)).toBeUndefined();
    });

    it("undefined 返回 undefined", () => {
      expect(fromDateStr(undefined)).toBeUndefined();
    });
  });

  // ─── parseLayout ─────────────────────────────────────────
  describe("parseLayout", () => {
    it("正常解析 3室2厅1卫", () => {
      expect(parseLayout("3室2厅1卫")).toEqual({
        rooms: 3,
        halls: 2,
        bathrooms: 1,
      });
    });

    it("解析 0室0厅0卫", () => {
      expect(parseLayout("0室0厅0卫")).toEqual({
        rooms: 0,
        halls: 0,
        bathrooms: 0,
      });
    });

    it("undefined 输入返回全 undefined", () => {
      expect(parseLayout(undefined)).toEqual({
        rooms: undefined,
        halls: undefined,
        bathrooms: undefined,
      });
    });

    it("空字符串返回全 undefined", () => {
      expect(parseLayout("")).toEqual({
        rooms: undefined,
        halls: undefined,
        bathrooms: undefined,
      });
    });

    it("缺少厅卫（如 3室）返回全 undefined", () => {
      expect(parseLayout("3室")).toEqual({
        rooms: undefined,
        halls: undefined,
        bathrooms: undefined,
      });
    });

    it("不匹配格式返回全 undefined", () => {
      expect(parseLayout("三室两厅")).toEqual({
        rooms: undefined,
        halls: undefined,
        bathrooms: undefined,
      });
    });
  });

  // ─── buildLayout ─────────────────────────────────────────
  describe("buildLayout", () => {
    it("正常组合 3室2厅1卫", () => {
      expect(buildLayout(3, 2, 1)).toBe("3室2厅1卫");
    });

    it("全部为 0 返回 undefined", () => {
      expect(buildLayout(0, 0, 0)).toBeUndefined();
    });

    it("全部 undefined 返回 undefined", () => {
      expect(buildLayout(undefined, undefined, undefined)).toBeUndefined();
    });

    it("只有 rooms 有值", () => {
      expect(buildLayout(3, 0, 0)).toBe("3室0厅0卫");
    });

    it("只有 halls 有值", () => {
      expect(buildLayout(0, 2, 0)).toBe("0室2厅0卫");
    });

    it("只有 bathrooms 有值", () => {
      expect(buildLayout(0, 0, 1)).toBe("0室0厅1卫");
    });

    it("rooms 为 undefined，halls 和 bathrooms 有值", () => {
      expect(buildLayout(undefined, 2, 1)).toBe("0室2厅1卫");
    });
  });

  // ─── convertAttachments ──────────────────────────────────
  describe("convertAttachments", () => {
    it("null 输入返回空数组", () => {
      expect(convertAttachments(null)).toEqual([]);
    });

    it("undefined 输入返回空数组", () => {
      expect(convertAttachments(undefined)).toEqual([]);
    });

    it("字符串 URL 数组：提取文件名并设置默认 category/fileType", () => {
      const result = convertAttachments(["https://example.com/docs/合同.pdf"]);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("合同.pdf");
      expect(result[0].url).toBe("https://example.com/docs/合同.pdf");
      expect(result[0].category).toBe("other");
      expect(result[0].fileType).toBe("pdf");
      expect(result[0].size).toBe(0);
      expect(result[0].uploadedAt).toBeTruthy();
      expect(result[0].id).toBeTruthy();
    });

    it("字符串 URL 无路径分隔符时 filename 为整个字符串", () => {
      const result = convertAttachments(["just-a-file.doc"]);
      expect(result[0].filename).toBe("just-a-file.doc");
    });

    it("字符串 URL 以 / 结尾时 filename 回退为 unknown", () => {
      const result = convertAttachments(["https://example.com/docs/"]);
      expect(result[0].filename).toBe("unknown");
    });

    it("AttachmentInput 对象数组：保留字段并验证 category", () => {
      const result = convertAttachments([
        {
          filename: "合同.pdf",
          url: "https://example.com/合同.pdf",
          category: "signing_contract",
          fileType: "pdf",
          size: 1024,
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("合同.pdf");
      expect(result[0].url).toBe("https://example.com/合同.pdf");
      expect(result[0].category).toBe("signing_contract");
      expect(result[0].fileType).toBe("pdf");
      expect(result[0].size).toBe(1024);
    });

    it("AttachmentInput 无 size 时默认 0", () => {
      const result = convertAttachments([
        {
          filename: "test.png",
          url: "https://example.com/test.png",
          category: "property_certificate",
          fileType: "image",
        },
      ]);
      expect(result[0].size).toBe(0);
    });

    it("AttachmentInput 无 filename 时默认 unknown", () => {
      const result = convertAttachments([
        {
          filename: "",
          url: "https://example.com/test.png",
          category: "other",
          fileType: "image",
        },
      ]);
      expect(result[0].filename).toBe("unknown");
    });

    it("无效 category 回退为 other", () => {
      const result = convertAttachments([
        {
          filename: "test.pdf",
          url: "https://example.com/test.pdf",
          category: "invalid_category",
          fileType: "pdf",
        },
      ]);
      expect(result[0].category).toBe("other");
    });

    it("无效 fileType 回退为 pdf", () => {
      const result = convertAttachments([
        {
          filename: "test.pdf",
          url: "https://example.com/test.pdf",
          category: "other",
          fileType: "invalid_type",
        },
      ]);
      expect(result[0].fileType).toBe("pdf");
    });

    it("数组中包含无效对象时返回默认值", () => {
      const result = convertAttachments([{ foo: "bar" }]);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("unknown");
      expect(result[0].url).toBe("");
      expect(result[0].category).toBe("other");
      expect(result[0].fileType).toBe("pdf");
      expect(result[0].size).toBe(0);
    });

    it("AttachmentContainer 对象：提取 attachments 数组", () => {
      const result = convertAttachments({
        attachments: [
          {
            filename: "身份证.jpg",
            url: "https://example.com/id.jpg",
            category: "owner_id_card",
            fileType: "image",
            size: 2048,
          },
        ],
      });
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("身份证.jpg");
      expect(result[0].category).toBe("owner_id_card");
      expect(result[0].fileType).toBe("image");
      expect(result[0].size).toBe(2048);
    });

    it("AttachmentContainer 中 attachments 为非数组时返回空", () => {
      const result = convertAttachments({ attachments: "not-array" });
      expect(result).toEqual([]);
    });

    it("AttachmentContainer 中 attachments 为 undefined 时返回空", () => {
      const result = convertAttachments({ attachments: undefined });
      expect(result).toEqual([]);
    });

    it("AttachmentContainer 中无效项被过滤", () => {
      const result = convertAttachments({
        attachments: [
          { filename: "valid.pdf", url: "https://example.com/valid.pdf", category: "other", fileType: "pdf" },
          { foo: "bar" }, // 无效，被过滤
          123, // 无效，被过滤
        ],
      });
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("valid.pdf");
    });

    it("AttachmentContainer 中 filename 为空字符串时回退为 unknown", () => {
      const result = convertAttachments({
        attachments: [
          { filename: "", url: "https://example.com/test.pdf", category: "other", fileType: "pdf" },
        ],
      });
      expect(result[0].filename).toBe("unknown");
    });

    it("既非数组也非 AttachmentContainer 返回空数组", () => {
      expect(convertAttachments({ foo: "bar" } as unknown as Parameters<typeof convertAttachments>[0])).toEqual([]);
    });

    it("空数组输入返回空数组", () => {
      expect(convertAttachments([])).toEqual([]);
    });

    it("每个结果项有唯一 id", () => {
      const result = convertAttachments([
        "https://a.com/1.pdf",
        "https://b.com/2.pdf",
      ]);
      expect(result).toHaveLength(2);
      expect(result[0].id).not.toBe(result[1].id);
    });
  });

  // ─── 类型守卫（通过 convertAttachments 间接测试）───────────
  describe("isAttachmentInput（间接测试）", () => {
    it("null 不匹配 AttachmentInput", () => {
      // null 在数组中会被当作无效数据
      const result = convertAttachments([null]);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("unknown");
    });

    it("缺少 url 的对象不匹配 AttachmentInput", () => {
      const result = convertAttachments([{ filename: "test.pdf" }]);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("unknown");
    });

    it("缺少 filename 的对象不匹配 AttachmentInput", () => {
      const result = convertAttachments([{ url: "https://example.com/test.pdf" }]);
      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe("unknown");
    });
  });

  // ─── 验证函数（通过 convertAttachments 间接测试）───────────
  describe("validateCategory / validateFileType（间接测试）", () => {
    it("所有合法 category 均通过验证", () => {
      const validCategories = [
        "signing_contract",
        "property_certificate",
        "property_survey",
        "owner_id_card",
        "owner_bank_card",
        "renovation_contract",
        "handover_document",
        "receipt",
        "cooperation_confirmation",
        "store_investment_agreement",
        "value_added_service",
        "other",
      ];
      for (const cat of validCategories) {
        const result = convertAttachments([
          { filename: "f", url: "u", category: cat, fileType: "pdf" },
        ]);
        expect(result[0].category).toBe(cat);
      }
    });

    it("所有合法 fileType 均通过验证", () => {
      const validTypes: Array<"excel" | "image" | "pdf" | "word"> = ["excel", "image", "pdf", "word"];
      for (const ft of validTypes) {
        const result = convertAttachments([
          { filename: "f", url: "u", category: "other", fileType: ft },
        ]);
        expect(result[0].fileType).toBe(ft);
      }
    });

    it("非法 category 回退为 other", () => {
      const result = convertAttachments([
        { filename: "f", url: "u", category: "nonexistent", fileType: "pdf" },
      ]);
      expect(result[0].category).toBe("other");
    });

    it("非法 fileType 回退为 pdf", () => {
      const result = convertAttachments([
        { filename: "f", url: "u", category: "other", fileType: "video" },
      ]);
      expect(result[0].fileType).toBe("pdf");
    });
  });
});
