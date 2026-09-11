import { describe, it, expect } from "vitest";
import {
  PERMISSION_CODES,
  PATH_PERMISSION_MAP,
  hasPathPermission,
  isRestrictedAdminPath,
} from "./permissions";

// ─── Task 14: 前端权限常量与路径守卫单元测试 ──────────────────────────────────
// 覆盖：
// - PATH_PERMISSION_MAP 包含 /admin/projects → project:read
// - hasPathPermission 各场景（命中/未命中/子路径/非受限路径/null permissions）
// - isRestrictedAdminPath 判断
// - PERMISSION_CODES 包含 4 个新业务身份权限常量

describe("permissions constants", () => {
  describe("PERMISSION_CODES", () => {
    it("should include 4 new project business permission codes", () => {
      expect(PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO).toBe(
        "project:renovation:upload_photo",
      );
      expect(PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE).toBe(
        "project:renovation:complete_stage",
      );
      expect(PERMISSION_CODES.PROJECT_SALES_ADD_RECORD).toBe("project:sales:add_record");
      expect(PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM).toBe("project:sales:manage_team");
    });

    it("should keep existing project permission codes unchanged", () => {
      expect(PERMISSION_CODES.PROJECT_READ).toBe("project:read");
      expect(PERMISSION_CODES.PROJECT_WRITE).toBe("project:write");
      expect(PERMISSION_CODES.PROJECT_DELETE).toBe("project:delete");
    });
  });

  describe("PATH_PERMISSION_MAP", () => {
    it("should include /admin/projects → project:read mapping", () => {
      const entry = PATH_PERMISSION_MAP.find((item) => item.prefix === "/admin/projects");
      expect(entry).toBeDefined();
      expect(entry?.permission).toBe(PERMISSION_CODES.PROJECT_READ);
    });

    it("should not duplicate /admin/projects prefix", () => {
      const matches = PATH_PERMISSION_MAP.filter((item) => item.prefix === "/admin/projects");
      expect(matches).toHaveLength(1);
    });
  });
});

describe("hasPathPermission", () => {
  it("should return true when user holds project:read and accesses /admin/projects", () => {
    expect(hasPathPermission("/admin/projects", ["project:read"])).toBe(true);
  });

  it("should return false when user lacks project:read and accesses /admin/projects", () => {
    expect(hasPathPermission("/admin/projects", [])).toBe(false);
  });

  it("should match child path /admin/projects/123 when user has project:read", () => {
    expect(hasPathPermission("/admin/projects/123", ["project:read"])).toBe(true);
  });

  it("should return false for child path when user lacks project:read", () => {
    expect(hasPathPermission("/admin/projects/123", ["user:read"])).toBe(false);
  });

  it("should return true for non-restricted path /admin regardless of permissions", () => {
    expect(hasPathPermission("/admin", ["project:read"])).toBe(true);
    expect(hasPathPermission("/admin", [])).toBe(true);
  });

  it("should return true for non-restricted path /admin/leads", () => {
    expect(hasPathPermission("/admin/leads", [])).toBe(true);
  });

  it("should treat null permissions as no permission", () => {
    expect(hasPathPermission("/admin/projects", null)).toBe(false);
  });

  it("should treat undefined permissions as no permission", () => {
    expect(hasPathPermission("/admin/projects", undefined)).toBe(false);
  });

  it("should respect longer prefix priority: /admin/properties/upload before /admin/properties", () => {
    // /admin/properties/upload 需要 property:upload，而非 property:read
    expect(hasPathPermission("/admin/properties/upload", ["property:upload"])).toBe(true);
    expect(hasPathPermission("/admin/properties/upload", ["property:governance"])).toBe(false);
  });
});

describe("isRestrictedAdminPath", () => {
  it("should return true for /admin/projects (restricted)", () => {
    expect(isRestrictedAdminPath("/admin/projects")).toBe(true);
  });

  it("should return true for /admin/projects/123 (child of restricted)", () => {
    expect(isRestrictedAdminPath("/admin/projects/123")).toBe(true);
  });

  it("should return true for /admin/users (restricted)", () => {
    expect(isRestrictedAdminPath("/admin/users")).toBe(true);
  });

  it("should return false for /admin (non-restricted root)", () => {
    expect(isRestrictedAdminPath("/admin")).toBe(false);
  });

  it("should return false for /admin/leads (non-restricted)", () => {
    expect(isRestrictedAdminPath("/admin/leads")).toBe(false);
  });
});
