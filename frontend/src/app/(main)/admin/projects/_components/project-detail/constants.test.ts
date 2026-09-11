import { describe, expect, it } from "vitest";
import { mapLegacyAttachmentCategory } from "./constants";

describe("mapLegacyAttachmentCategory", () => {
  describe("新 6 类分类透传", () => {
    it.each([
      "contract_agreement",
      "property_rights",
      "identity_account",
      "finance_tax",
      "handover",
      "other",
    ] as const)("%s 原样返回", (category) => {
      expect(mapLegacyAttachmentCategory(category)).toBe(category);
    });
  });

  describe("旧 12 类映射到新 6 类", () => {
    it.each([
      ["signing_contract", "contract_agreement"],
      ["renovation_contract", "contract_agreement"],
      ["cooperation_confirmation", "contract_agreement"],
      ["store_investment_agreement", "contract_agreement"],
      ["value_added_service", "contract_agreement"],
      ["property_certificate", "property_rights"],
      ["property_survey", "property_rights"],
      ["owner_id_card", "identity_account"],
      ["owner_bank_card", "identity_account"],
      ["receipt", "finance_tax"],
      ["handover_document", "handover"],
    ] as const)("%s → %s", (legacy, mapped) => {
      expect(mapLegacyAttachmentCategory(legacy)).toBe(mapped);
    });
  });

  it("未知值归入 other", () => {
    expect(mapLegacyAttachmentCategory("unknown_category")).toBe("other");
  });

  it("空字符串归入 other", () => {
    expect(mapLegacyAttachmentCategory("")).toBe("other");
  });
});
